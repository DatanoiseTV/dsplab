import React from 'react';

interface PillProps {
  children: React.ReactNode;
  color: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function Pill({ children, color, onClick, style }: PillProps) {
  return (
    <span
      className="pill"
      onClick={onClick}
      style={{
        color,
        background: `${color}15`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
