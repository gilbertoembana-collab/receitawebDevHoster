import React, { useState, useRef, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, 
  Box, Typography, TextField, IconButton, Alert, Chip, InputAdornment 
} from '@mui/material';
import { QrCode, Camera, Check, X, Sparkles, RefreshCw } from 'lucide-react';

interface QrScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onQrCodeSelected: (code: string) => void;
  initialCode?: string;
  contribuinteDoc?: string;
}

export const QrScannerDialog: React.FC<QrScannerDialogProps> = ({
  open,
  onClose,
  onQrCodeSelected,
  initialCode = '',
  contribuinteDoc = ''
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [manualCode, setManualCode] = useState(initialCode);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);

  const startCameraAndScanner = async () => {
    setCameraError(null);
    setDetectedCode(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Câmera indisponível no navegador.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      // Check if native BarcodeDetector API exists
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
        const scanLoop = async () => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0) {
                const found = barcodes[0].rawValue;
                if (found) {
                  setDetectedCode(found);
                  setManualCode(found);
                  stopCamera();
                  return;
                }
              }
            } catch (e) {
              // detection frame skipped
            }
          }
          animationFrameRef.current = requestAnimationFrame(scanLoop);
        };
        animationFrameRef.current = requestAnimationFrame(scanLoop);
      }
    } catch (err: any) {
      setCameraError('Câmera não iniciada. Digite o código manualmente ou use a geração automática.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (open) {
      setManualCode(initialCode || '');
      setDetectedCode(null);
      startCameraAndScanner();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [open, initialCode]);

  const handleGenerateRandom = () => {
    const prefix = contribuinteDoc ? contribuinteDoc.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : 'QR';
    const randCode = `QR-FEIRANTE-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
    setManualCode(randCode);
    setDetectedCode(randCode);
  };

  const handleConfirm = () => {
    const code = manualCode.trim() || detectedCode?.trim();
    if (code) {
      onQrCodeSelected(code);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <QrCode size={20} className="text-blue-600" />
        <span>Scanear ou Digitar QR Code</span>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }}>
        {/* Live Camera Scanner Viewport */}
        <Box sx={{ 
          position: 'relative', 
          width: '100%', 
          aspectRatio: '4/3', 
          bgcolor: '#0f172a', 
          borderRadius: 2, 
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 2
        }}>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover" 
          />

          {/* QR Scanner Frame Overlay */}
          <div className="absolute inset-8 border-2 border-dashed border-emerald-400 rounded-2xl pointer-events-none flex items-center justify-center shadow-[0_0_15px_rgba(52,211,153,0.3)]">
            <div className="w-full h-0.5 bg-emerald-400 absolute animate-pulse shadow-lg" />
          </div>

          {!cameraActive && (
            <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-4 text-center text-slate-300">
              <QrCode size={36} className="text-slate-500 mb-2" />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Posicione o QR Code em frente à câmera ou digite o código abaixo.
              </Typography>
            </div>
          )}
        </Box>

        {/* Code Input */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            fullWidth
            size="small"
            label="Código do QR Code / Tag NFC"
            placeholder="Ex: QR-FEIRANTE-NIF144798"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <QrCode size={16} className="text-slate-400" />
                  </InputAdornment>
                ),
                style: { fontFamily: 'monospace', fontWeight: 600 }
              }
            }}
          />

          <Button
            size="small"
            variant="outlined"
            color="secondary"
            startIcon={<Sparkles size={14} />}
            onClick={handleGenerateRandom}
            sx={{ textTransform: 'none', fontSize: '11px', alignSelf: 'flex-start' }}
          >
            Gerar QR Code Automático do Feirante
          </Button>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={onClose} color="inherit" size="small" sx={{ textTransform: 'none' }}>
          Cancelar
        </Button>
        <Button
          size="small"
          variant="contained"
          color="primary"
          startIcon={<Check size={16} />}
          onClick={handleConfirm}
          disabled={!manualCode.trim() && !detectedCode}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Confirmar Código
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default QrScannerDialog;
