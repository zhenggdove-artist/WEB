import React, { useRef, useState } from 'react';

interface UIOverlayProps {
  isFading: boolean;
}

// Global event emitter for joystick to communicate with Scene/Player without passing props through Canvas
export const joystickState = { x: 0, y: 0 };
export const fireButtonState = { toggled: false };

const UIOverlay: React.FC<UIOverlayProps> = ({ isFading }) => {
  const stickRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const [touching, setTouching] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouching(true);
    updateJoystick(e.touches[0]);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touching) {
      updateJoystick(e.touches[0]);
    }
  };

  const handleTouchEnd = () => {
    setTouching(false);
    setPos({ x: 0, y: 0 });
    joystickState.x = 0;
    joystickState.y = 0;
  };

  const updateJoystick = (touch: React.Touch) => {
    if (!baseRef.current) return;
    const baseRect = baseRef.current.getBoundingClientRect();
    const centerX = baseRect.left + baseRect.width / 2;
    const centerY = baseRect.top + baseRect.height / 2;

    const maxDist = baseRect.width / 2;

    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxDist) {
      const angle = Math.atan2(dy, dx);
      dx = Math.cos(angle) * maxDist;
      dy = Math.sin(angle) * maxDist;
    }

    setPos({ x: dx, y: dy });

    // Normalize -1 to 1
    joystickState.x = dx / maxDist;
    joystickState.y = -(dy / maxDist); // Invert Y for intuitive up movement
  };

  return (
    <>
      {/* Fade Overlay */}
      <div className={`overlay-fade ${isFading ? 'active' : ''}`} />
      
      {/* Virtual Joystick (Mobile Only) */}
      <div 
        className="joystick-wrapper"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div ref={baseRef} className="joystick-base">
          <div 
            ref={stickRef}
            className="joystick-stick"
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px)`,
              transition: touching ? 'none' : 'transform 0.2s ease-out'
            }}
          />
        </div>
      </div>

      {/* Fire Toggle Button */}
      <button
        className="fire-button"
        aria-label="Fire"
        onMouseDown={(e) => { e.preventDefault(); fireButtonState.toggled = !fireButtonState.toggled; }}
        onTouchStart={(e) => { e.preventDefault(); fireButtonState.toggled = !fireButtonState.toggled; }}
      >
        {fireButtonState.toggled ? 'ON' : 'OFF'}
      </button>
    </>
  );
};

export default UIOverlay;
