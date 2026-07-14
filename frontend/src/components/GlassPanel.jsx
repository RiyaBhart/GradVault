import React from 'react';

/**
 * GlassPanel
 * Reusable wrapper for applying the glassmorphic theme treatment.
 * 
 * @param {string} variant - 'default' | 'light' (for headers) | 'solid' (for entry cards)
 */
export default function GlassPanel({ children, variant = 'default', className = '', style = {}, ...props }) {
  let baseClass = 'glass-panel';
  if (variant === 'light') baseClass = 'glass-panel-light';
  if (variant === 'solid') baseClass = 'glass-panel-solid';

  return (
    <div className={`${baseClass} ${className}`} style={style} {...props}>
      {children}
    </div>
  );
}
