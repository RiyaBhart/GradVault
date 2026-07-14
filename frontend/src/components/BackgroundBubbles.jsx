export default function BackgroundBubbles() {
  // Generate 12 bubbles with randomized properties for a natural drifting effect
  const bubbles = Array.from({ length: 12 }).map((_, i) => {
    const size = Math.random() * 16 + 8; // 8px to 24px
    const left = Math.random() * 100; // 0% to 100%
    const duration = Math.random() * 10 + 15; // 15s to 25s
    const delay = Math.random() * 10; // 0s to 10s
    const opacity = Math.random() * 0.07 + 0.08; // 0.08 to 0.15

    return (
      <div
        key={i}
        className="background-bubble"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${left}%`,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          opacity: opacity,
          '--opacity': opacity
        }}
      />
    );
  });

  return (
    <div className="background-bubbles-container" aria-hidden="true">
      {bubbles}
    </div>
  );
}
