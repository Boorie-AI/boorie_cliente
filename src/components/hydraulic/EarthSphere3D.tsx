import React, { useRef, useEffect, useState } from 'react';
import { Map, Network, FileUp } from 'lucide-react';

interface EarthSphere3DProps {
  networkData?: any;
  onLoadNetwork?: () => void;
}

export const EarthSphere3D: React.FC<EarthSphere3DProps> = ({ 
  networkData, 
  onLoadNetwork 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setupCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };

    setupCanvas();

    // Simple Earth sphere rendering
    const renderEarth = () => {
      const centerX = canvas.width / (2 * window.devicePixelRatio);
      const centerY = canvas.height / (2 * window.devicePixelRatio);
      const radius = Math.min(centerX, centerY) * 0.4;

      // Clear canvas
      ctx.clearRect(0, 0, centerX * 2, centerY * 2);

      // Create gradient for Earth-like appearance
      const gradient = ctx.createRadialGradient(
        centerX - radius * 0.3, centerY - radius * 0.3, 0,
        centerX, centerY, radius
      );
      
      // Earth colors
      gradient.addColorStop(0, '#87CEEB'); // Light blue (highlight)
      gradient.addColorStop(0.3, '#4682B4'); // Steel blue (oceans)
      gradient.addColorStop(0.7, '#228B22'); // Forest green (land)
      gradient.addColorStop(0.9, '#2F4F4F'); // Dark slate gray (shadow)
      gradient.addColorStop(1, '#1C1C1C'); // Near black (edge)

      // Draw main sphere
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Add continent-like shapes for visual interest
      ctx.fillStyle = '#90EE90'; // Light green for continents
      ctx.globalAlpha = 0.6;
      
      // Simple continent shapes (very basic representation)
      const continentShapes = [
        // North America-like shape
        { x: centerX - radius * 0.4, y: centerY - radius * 0.3, w: radius * 0.5, h: radius * 0.4 },
        // Europe/Africa-like shape
        { x: centerX + radius * 0.1, y: centerY - radius * 0.2, w: radius * 0.3, h: radius * 0.6 },
        // Asia-like shape
        { x: centerX + radius * 0.3, y: centerY - radius * 0.4, w: radius * 0.4, h: radius * 0.3 },
      ];

      continentShapes.forEach(shape => {
        const withinSphere = Math.sqrt(
          Math.pow(shape.x + shape.w/2 - centerX, 2) + 
          Math.pow(shape.y + shape.h/2 - centerY, 2)
        ) < radius * 0.8;

        if (withinSphere) {
          ctx.beginPath();
          ctx.ellipse(
            shape.x + shape.w/2, 
            shape.y + shape.h/2, 
            shape.w/2, 
            shape.h/2, 
            rotation.y * 0.01, 
            0, 
            Math.PI * 2
          );
          ctx.fill();
        }
      });

      ctx.globalAlpha = 1;

      // Add atmospheric glow
      const atmosphereGradient = ctx.createRadialGradient(
        centerX, centerY, radius * 0.9,
        centerX, centerY, radius * 1.2
      );
      atmosphereGradient.addColorStop(0, 'rgba(135, 206, 235, 0.2)');
      atmosphereGradient.addColorStop(1, 'rgba(135, 206, 235, 0)');

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = atmosphereGradient;
      ctx.fill();

      // Add subtle rotation animation
      setRotation(prev => ({ 
        x: prev.x + 0.2, 
        y: prev.y + 0.5 
      }));
    };

    const animate = () => {
      renderEarth();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Resize handler
    const handleResize = () => setupCanvas();
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [rotation]);

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-black via-gray-900 to-black overflow-hidden">
      {/* Space background with stars */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `radial-gradient(2px 2px at 20px 30px, #eee, transparent),
                           radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.5), transparent),
                           radial-gradient(1px 1px at 90px 40px, #fff, transparent),
                           radial-gradient(1px 1px at 130px 80px, rgba(255,255,255,0.6), transparent),
                           radial-gradient(2px 2px at 160px 30px, #ddd, transparent)`,
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 100px'
        }}
      />

      {/* Earth sphere canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-pointer"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        style={{
          filter: isHovering ? 'brightness(1.1)' : 'brightness(1)',
          transition: 'filter 0.3s ease'
        }}
      />

      {/* Floating UI elements */}
      <div className="absolute top-4 left-4 text-white">
        <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
          🌍 WNTR Earth View
        </h3>
        <p className="text-sm text-gray-300">
          Visualización hidráulica planetaria
        </p>
      </div>

      {/* Network status */}
      <div className="absolute top-4 right-4">
        {networkData ? (
          <div className="bg-green-600/20 border border-green-500/30 rounded-lg p-3 text-white backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-1">
              <Network className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium">Red Cargada</span>
            </div>
            <div className="text-xs text-green-200">
              {networkData.summary?.junctions || 0} nodos • {networkData.summary?.pipes || 0} tuberías
            </div>
          </div>
        ) : (
          <div className="bg-blue-600/20 border border-blue-500/30 rounded-lg p-3 text-white backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <Map className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium">Vista Global</span>
            </div>
            {onLoadNetwork && (
              <button
                onClick={onLoadNetwork}
                className="flex items-center gap-2 px-3 py-1 bg-blue-600/30 hover:bg-blue-600/40 rounded text-xs transition-colors"
              >
                <FileUp className="h-3 w-3" />
                Cargar Red
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="bg-black/30 backdrop-blur-sm rounded-lg p-3 text-white text-center">
          <div className="text-sm">
            {networkData ? (
              <>
                <span className="text-blue-300">🌐 Red hidráulica cargada:</span>
                <span className="ml-2 font-medium">{networkData.name || 'Red sin nombre'}</span>
              </>
            ) : (
              <>
                <span className="text-gray-300">🌍 Planeta Tierra • Sistema Global de Análisis Hidráulico</span>
                <br />
                <span className="text-xs text-gray-400 mt-1">
                  Carga una red EPANET para ver su ubicación en el planeta
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Network location marker (when network is loaded) */}
      {networkData && (
        <div 
          className="absolute animate-pulse"
          style={{
            left: '60%', // Approximate network location on sphere
            top: '45%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="bg-red-500 w-3 h-3 rounded-full border-2 border-white shadow-lg">
            <div className="bg-red-400 w-full h-full rounded-full animate-ping"></div>
          </div>
        </div>
      )}
    </div>
  );
};