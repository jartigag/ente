import { Backdrop, Box, IconButton, useTheme } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge';
import { EnteFile } from 'types/file';
import { getRenderableFileURL } from 'utils/file';
import downloadManager from 'services/downloadManager';
import { MenuItemGroup } from 'components/Menu/MenuItemGroup';
import { EnteMenuItem } from 'components/Menu/EnteMenuItem';
import CropOriginalIcon from '@mui/icons-material/CropOriginal';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import Crop169Icon from '@mui/icons-material/Crop169';
import Crop32Icon from '@mui/icons-material/Crop32';
interface IProps {
    file: EnteFile;
}

const PRESET_ASPECT_RATIOS = [
    {
        width: 16,
        height: 9,
        icon: <Crop169Icon />,
    },
    {
        width: 3,
        height: 2,
        icon: <Crop32Icon />,
    },
    {
        width: 1,
        height: 1,
        icon: <CropSquareIcon />,
    },
];

const ImageEditorOverlay = (props: IProps) => {
    const [originalWidth, originalHeight] = [props.file.w, props.file.h];

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const parentRef = useRef<HTMLDivElement | null>(null);

    const [fileURL, setFileURL] = useState<string>('');

    const loadCanvas = async () => {
        const img = new Image();
        const ctx = canvasRef.current?.getContext('2d');
        if (!fileURL) {
            const stream = await downloadManager.downloadFile(props.file);
            const fileBlob = await new Response(stream).blob();
            const { converted } = await getRenderableFileURL(
                props.file,
                fileBlob
            );
            img.src = converted[0];
            setFileURL(converted[0]);
        } else {
            img.src = fileURL;
        }
        img.onload = () => {
            const scale = Math.min(
                parentRef.current?.clientWidth / img.width,
                parentRef.current?.clientHeight / img.height
            );
            const width = img.width * scale;
            const height = img.height * scale;
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            ctx?.drawImage(img, 0, 0, width, height);
        };
    };

    useEffect(() => {
        loadCanvas();
    }, []);

    const theme = useTheme();

    // Crops the canvas according to originalHeight and originalWidth without compounding
    const cropCanvas = async (widthRatio: number, heightRatio: number) => {
        const context = canvasRef.current?.getContext('2d');
        const canvas = canvasRef.current;

        const aspectRatio = widthRatio / heightRatio;

        if (!context || !canvas) return;

        const img = new Image();
        img.src = fileURL;
        img.onload = () => {
            const sourceWidth = img.width;
            const sourceHeight = img.height;

            let sourceX = 0;
            let sourceY = 0;

            if (sourceWidth / sourceHeight > aspectRatio) {
                sourceX = (sourceWidth - sourceHeight * aspectRatio) / 2;
            } else {
                sourceY = (sourceHeight - sourceWidth / aspectRatio) / 2;
            }

            const newWidth = sourceWidth - 2 * sourceX;
            const newHeight = sourceHeight - 2 * sourceY;

            context.clearRect(0, 0, canvas.width, canvas.height);

            canvas.width = newWidth;
            canvas.height = newHeight;

            context.drawImage(
                img,
                sourceX,
                sourceY,
                newWidth,
                newHeight,
                0,
                0,
                newWidth,
                newHeight
            );
        };
    };

    return (
        <>
            <Backdrop
                sx={{
                    color: '#fff',
                    zIndex: '999 !important',
                    display: 'flex',
                    width: '100%',
                    justifyContent: 'space-between',
                }}
                open>
                <Box
                    display="inline-block"
                    width="100%"
                    height="100%"
                    overflow="hidden">
                    <Box display="flex" gap="0.5rem" alignItems="center">
                        <IconButton>
                            <PhotoSizeSelectLargeIcon />
                        </IconButton>
                    </Box>
                    <Box
                        height="100%"
                        width="100%"
                        ref={parentRef}
                        display="flex"
                        alignItems="center"
                        justifyContent="center">
                        <canvas
                            ref={canvasRef}
                            height={originalHeight}
                            width={originalWidth}
                            style={{ maxWidth: '100%', maxHeight: '100%' }}
                        />
                    </Box>
                </Box>
                <Box
                    height="100%"
                    width="30rem"
                    bgcolor={theme.colors.background.elevated}
                    padding="1rem"
                    boxSizing="border-box">
                    <MenuItemGroup>
                        <EnteMenuItem
                            startIcon={<CropOriginalIcon />}
                            onClick={() => {
                                loadCanvas();
                            }}
                            label={'Original'}
                        />

                        {PRESET_ASPECT_RATIOS.map((ratio, index) => (
                            <EnteMenuItem
                                key={index}
                                startIcon={ratio.icon}
                                onClick={() => {
                                    cropCanvas(ratio.width, ratio.height);
                                }}
                                label={`${ratio.width}:${ratio.height}`}
                            />
                        ))}
                    </MenuItemGroup>
                </Box>
            </Backdrop>
        </>
    );
};

export default ImageEditorOverlay;
