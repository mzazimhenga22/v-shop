import React from "react";
import { Player } from "@lottiefiles/react-lottie-player";

export default function FireLottie({ size = 96 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <Player
        autoplay
        loop
        src="https://assets7.lottiefiles.com/packages/lf20_5ngs2ksb.json" // 🔥 fire animation URL
        style={{ width: size, height: size }}
        className="pointer-events-none"
      />
    </div>
  );
}
