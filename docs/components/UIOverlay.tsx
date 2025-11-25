import React, { useRef, useState } from 'react';

interface UIOverlayProps {
  isFading: boolean;
}

// Shared joystick state consumed by the 3D scene.
export const joystickState = { x: 0, y: 0 };
// Shared fire button state for mobile/overlay.
export const fireButtonState = { pressed: false };

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
    if (!touching) return;
    updateJoystick(e.touches[0]);
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
    joystickState.x = dx / maxDist;
    joystickState.y = -(dy / maxDist);
  };

  const handleFireDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    fireButtonState.pressed = true;
  };

  const handleFireUp = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    fireButtonState.pressed = false;
  };

  return (
    <>
      <div className={`overlay-fade ${isFading ? 'active' : ''}`} />

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
              transition: touching ? 'none' : 'transform 0.2s ease-out',
            }}
          />
        </div>
      </div>

      <button
        className="fire-button"
        type="button"
        onMouseDown={handleFireDown}
        onMouseUp={handleFireUp}
        onMouseLeave={handleFireUp}
        onTouchStart={handleFireDown}
        onTouchEnd={handleFireUp}
        aria-label="Fire"
      >
        FIRE
      </button>
    </>
  );
};

export default UIOverlay;
