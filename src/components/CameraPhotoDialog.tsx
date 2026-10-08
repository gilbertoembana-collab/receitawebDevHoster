import React, { useState, useRef, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, 
  Box, Typography, IconButton, Alert, Chip, CircularProgress 
} from '@mui/material';
import { Camera, RefreshCw, Check, X, Upload, FlipHorizontal, Image as ImageIcon } from 'lucide-react';
import { compressImageToMaxKB, CompressedImageResult } from '../utils/imageCompressor';

interface CameraPhotoDialogProps {
  open: boolean;
  onClose: () => void;
  onPhotoCaptured: (photoBase64: string, sizeKB: number) => void;
  currentPhoto?: string;
  maxKB?: number;
}

export const CameraPhotoDialog: React.FC<CameraPhotoDialogProps> = ({
  open,
  onClose,
  onPhotoCaptured,
  currentPhoto,
  maxKB = 70
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedPreview, setCapturedPreview] = useState<CompressedImageResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // Start Camera Stream
  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    setCameraError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Acesso à câmera não suportado neste navegador. Use a opção de carregar arquivo.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Camera access error:', err);
      // Try fallback to any available video device
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play();
        }
        setCameraActive(true);
      } catch (fallbackErr: any) {
        setCameraError(fallbackErr.message || 'Não foi possível acessar a câmera. Você pode carregar uma foto do seu aparelho.');
        setCameraActive(false);
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (open) {
      setCapturedPreview(null);
      startCamera(facingMode);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [open]);

  const handleFlipCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    setIsCompressing(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Falha ao processar imagem');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);

      // Compress to maximum 70 KB
      const result = await compressImageToMaxKB(rawDataUrl, maxKB);
      setCapturedPreview(result);
      stopCamera();
    } catch (err: any) {
      alert('Erro ao capturar foto: ' + (err.message || err));
    } finally {
      setIsCompressing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    try {
      const result = await compressImageToMaxKB(file, maxKB);
      setCapturedPreview(result);
      stopCamera();
    } catch (err: any) {
      alert('Erro ao processar imagem: ' + (err.message || err));
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirm = () => {
    if (capturedPreview) {
      onPhotoCaptured(capturedPreview.base64, capturedPreview.sizeKB);
      onClose();
    }
  };

  const handleRetake = () => {
    setCapturedPreview(null);
    startCamera(facingMode);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Camera size={20} className="text-blue-600" />
          <span>Foto do Contribuinte</span>
        </Box>
        <Chip 
          size="small" 
          label={`Máx: ${maxKB} KB`} 
          color="info" 
          variant="outlined" 
          sx={{ fontSize: '10px', height: 20, fontWeight: 700 }} 
        />
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }}>
        {cameraError && !capturedPreview && (
          <Alert severity="warning" sx={{ mb: 2, fontSize: '12px' }}>
            {cameraError}
          </Alert>
        )}

        <Box sx={{ 
          position: 'relative', 
          width: '100%', 
          aspectRatio: '4/3', 
          bgcolor: '#0f172a', 
          borderRadius: 2, 
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {/* Live Video Viewfinder */}
          {!capturedPreview && (
            <>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover" 
              />

              {/* Viewfinder Target Overlay */}
              <div className="absolute inset-4 border-2 border-dashed border-white/50 rounded-xl pointer-events-none flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border border-white/40" />
              </div>

              {/* Camera Action Buttons on Overlay */}
              {cameraActive && (
                <div className="absolute top-2 right-2 flex gap-1">
                  <IconButton 
                    size="small" 
                    onClick={handleFlipCamera}
                    sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}
                    title="Alternar Câmera"
                  >
                    <FlipHorizontal size={16} />
                  </IconButton>
                </div>
              )}
            </>
          )}

          {/* Captured Image Result Preview */}
          {capturedPreview && (
            <img 
              src={capturedPreview.base64} 
              alt="Foto Capturada" 
              className="w-full h-full object-cover" 
            />
          )}

          {isCompressing && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white gap-2 z-10">
              <CircularProgress size={32} color="inherit" />
              <span className="text-xs font-semibold">Otimizando para &le; {maxKB} KB...</span>
            </div>
          )}
        </Box>

        {/* Compression Size Feedback */}
        {capturedPreview && (
          <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5, border: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 600 }}>
                Tamanho Otimizado (Supabase)
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800, color: capturedPreview.sizeKB <= maxKB ? 'success.main' : 'warning.main', fontFamily: 'monospace' }}>
                {capturedPreview.sizeKB} KB <span className="text-xs text-slate-500 font-sans font-normal">({capturedPreview.width}x{capturedPreview.height}px)</span>
              </Typography>
            </Box>
            <Chip 
              size="small" 
              label={capturedPreview.sizeKB <= maxKB ? `✓ Menor que ${maxKB} KB` : 'Compressão OK'} 
              color="success" 
              sx={{ fontSize: '10px', height: 22, fontWeight: 700 }} 
            />
          </Box>
        )}

        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*" 
          capture="environment"
          onChange={handleFileUpload} 
          style={{ display: 'none' }} 
        />
      </DialogContent>

      <DialogActions sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}>
        {!capturedPreview ? (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Upload size={15} />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ textTransform: 'none' }}
            >
              Galeria / Arquivo
            </Button>
            
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button onClick={onClose} color="inherit" size="small" sx={{ textTransform: 'none' }}>
                Cancelar
              </Button>
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={<Camera size={16} />}
                onClick={handleCapture}
                disabled={!cameraActive || isCompressing}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Capturar
              </Button>
            </Box>
          </>
        ) : (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshCw size={14} />}
              onClick={handleRetake}
              sx={{ textTransform: 'none' }}
            >
              Tirar Outra
            </Button>
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<Check size={16} />}
              onClick={handleConfirm}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Salvar Foto ({capturedPreview.sizeKB} KB)
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CameraPhotoDialog;
