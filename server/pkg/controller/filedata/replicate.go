package filedata

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/ente-io/museum/ente/filedata"
	fileDataRepo "github.com/ente-io/museum/pkg/repo/filedata"
	enteTime "github.com/ente-io/museum/pkg/utils/time"
	"github.com/ente-io/stacktrace"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/viper"
	"time"
)

// StartReplication starts the replication process for file data.
// If
func (c *Controller) StartReplication() error {
	workerURL := viper.GetString("replication.worker-url")
	if workerURL == "" {
		log.Infof("replication.worker-url was not defined, file data will downloaded directly during replication")
	} else {
		log.Infof("Worker URL to download objects for file-data replication is: %s", workerURL)
	}
	c.workerURL = workerURL

	workerCount := viper.GetInt("replication.file-data.worker-count")
	if workerCount == 0 {
		workerCount = 6
	}
	go c.startWorkers(workerCount)
	return nil
}
func (c *Controller) startWorkers(n int) {
	log.Infof("Starting %d workers for replication v3", n)

	for i := 0; i < n; i++ {
		go c.replicate(i)
		// Stagger the workers
		time.Sleep(time.Duration(2*i+1) * time.Second)
	}
}

// Entry point for the replication worker (goroutine)
//
// i is an arbitrary index of the current routine.
func (c *Controller) replicate(i int) {
	for {
		err := c.tryReplicate()
		if err != nil {
			// Sleep in proportion to the (arbitrary) index to space out the
			// workers further.
			time.Sleep(time.Duration(i+1) * time.Minute)
		}
	}
}

func (c *Controller) tryReplicate() error {
	newLockTime := enteTime.MicrosecondsAfterMinutes(60)
	ctx, cancelFun := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancelFun()
	row, err := c.Repo.GetPendingSyncDataAndExtendLock(ctx, newLockTime, false)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			log.Errorf("Could not fetch row for replication: %s", err)
		}
		return err
	}
	err = c.replicateRowData(ctx, *row)
	if err != nil {
		log.WithFields(log.Fields{
			"file_id": row.FileID,
			"type":    row.Type,
			"size":    row.Size,
			"userID":  row.UserID,
		}).Errorf("Could not replicate file data: %s", err)
		return err
	} else {
		// If the replication was completed without any errors, we can reset the lock time
		return c.Repo.ResetSyncLock(ctx, *row, newLockTime)
	}
}

func (c *Controller) replicateRowData(ctx context.Context, row filedata.Row) error {
	wantInBucketIDs := map[string]bool{}
	wantInBucketIDs[c.S3Config.GetBucketID(row.Type)] = true
	rep := c.S3Config.GetReplicatedBuckets(row.Type)
	for _, bucket := range rep {
		wantInBucketIDs[bucket] = true
	}
	delete(wantInBucketIDs, row.LatestBucket)
	for _, bucket := range row.ReplicatedBuckets {
		delete(wantInBucketIDs, bucket)
	}
	if len(wantInBucketIDs) > 0 {
		s3FileMetadata, err := c.downloadObject(ctx, row.S3FileMetadataObjectKey(), row.LatestBucket)
		if err != nil {
			return stacktrace.Propagate(err, "error fetching metadata object "+row.S3FileMetadataObjectKey())
		}
		for bucketID := range wantInBucketIDs {
			if err := c.uploadAndVerify(ctx, row, s3FileMetadata, bucketID); err != nil {
				return stacktrace.Propagate(err, "error uploading and verifying metadata object")
			}
		}
	} else {
		log.Infof("No replication pending for file %d and type %s", row.FileID, string(row.Type))
	}
	return c.Repo.MarkReplicationAsDone(ctx, row)
}

func (c *Controller) uploadAndVerify(ctx context.Context, row filedata.Row, s3FileMetadata filedata.S3FileMetadata, dstBucketID string) error {
	if err := c.Repo.RegisterReplicationAttempt(ctx, row, dstBucketID); err != nil {
		return stacktrace.Propagate(err, "could not register replication attempt")
	}
	metadataSize, err := c.uploadObject(s3FileMetadata, row.S3FileMetadataObjectKey(), dstBucketID)
	if err != nil {
		return err
	}
	if metadataSize != row.Size {
		return fmt.Errorf("uploaded metadata size %d does not match expected size %d", metadataSize, row.Size)
	}
	return c.Repo.MoveBetweenBuckets(row, dstBucketID, fileDataRepo.InflightRepColumn, fileDataRepo.ReplicationColumn)
}
