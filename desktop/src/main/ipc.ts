/**
 * @file Listen for IPC events sent/invoked by the renderer process, and route
 * them to their correct handlers.
 *
 * This file is meant as a sibling to `preload.ts`, but this one runs in the
 * context of the main process, and can import other files from `src/`.
 */

import { ipcMain } from "electron/main";
import { clearElectronStore } from "../api/electronStore";
import { getEncryptionKey, setEncryptionKey } from "../api/safeStorage";
import {
    appVersion,
    muteUpdateNotification,
    skipAppUpdate,
    updateAndRestart,
} from "../services/appUpdater";
import {
    computeImageEmbedding,
    computeTextEmbedding,
} from "../services/clipService";
import { runFFmpegCmd } from "../services/ffmpeg";
import {
    convertToJPEG,
    generateImageThumbnail,
} from "../services/imageProcessor";
import type { ElectronFile, Model } from "../types";
import { checkExistsAndCreateDir, fsExists } from "./fs";
import { openDirectory, openLogDirectory } from "./general";
import { logToDisk } from "./log";

export const attachIPCHandlers = () => {
    // Notes:
    //
    // The first parameter of the handler passed to `ipcMain.handle` is the
    // `event`, and is usually ignored. The rest of the parameters are the
    // arguments passed to `ipcRenderer.invoke`.
    //
    // [Note: Catching exception during .send/.on]
    //
    // While we can use ipcRenderer.send/ipcMain.on for one-way communication,
    // that has the disadvantage that any exceptions thrown in the processing of
    // the handler are not sent back to the renderer. So we use the
    // ipcRenderer.invoke/ipcMain.handle 2-way pattern even for things that are
    // conceptually one way. An exception (pun intended) to this is logToDisk,
    // which is a primitive, frequently used, operation and shouldn't throw, so
    // having its signature by synchronous is a bit convenient.

    // - General

    ipcMain.handle("appVersion", (_) => appVersion());

    ipcMain.handle("openDirectory", (_, dirPath) => openDirectory(dirPath));

    ipcMain.handle("openLogDirectory", (_) => openLogDirectory());

    // See: [Note: Catching exception during .send/.on]
    ipcMain.on("logToDisk", (_, message) => logToDisk(message));

    ipcMain.on("clear-electron-store", (_) => {
        clearElectronStore();
    });

    ipcMain.handle("setEncryptionKey", (_, encryptionKey) =>
        setEncryptionKey(encryptionKey),
    );

    ipcMain.handle("getEncryptionKey", (_) => getEncryptionKey());

    ipcMain.on("update-and-restart", (_) => updateAndRestart());

    ipcMain.on("skip-app-update", (_, version) => skipAppUpdate(version));

    ipcMain.on("mute-update-notification", (_, version) =>
        muteUpdateNotification(version),
    );

    ipcMain.handle("convertToJPEG", (_, fileData, filename) =>
        convertToJPEG(fileData, filename),
    );

    ipcMain.handle(
        "generateImageThumbnail",
        (_, inputFile, maxDimension, maxSize) =>
            generateImageThumbnail(inputFile, maxDimension, maxSize),
    );

    ipcMain.handle(
        "runFFmpegCmd",
        (
            _,
            cmd: string[],
            inputFile: File | ElectronFile,
            outputFileName: string,
            dontTimeout?: boolean,
        ) => runFFmpegCmd(cmd, inputFile, outputFileName, dontTimeout),
    );

    ipcMain.handle(
        "computeImageEmbedding",
        (_, model: Model, imageData: Uint8Array) =>
            computeImageEmbedding(model, imageData),
    );

    ipcMain.handle("computeTextEmbedding", (_, model: Model, text: string) =>
        computeTextEmbedding(model, text),
    );

    ipcMain.handle("fsExists", (_, path) => fsExists(path));

    ipcMain.handle("checkExistsAndCreateDir", (_, dirPath) =>
        checkExistsAndCreateDir(dirPath),
    );
};
