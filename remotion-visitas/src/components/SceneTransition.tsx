import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  enterFrames?: number;
  exitFrames?: number;
};

export const SceneTransition = ({
  children,
  enterFrames = 15,
  exitFrames = 12,
}: Props) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const enter = interpolate(frame, [0, enterFrames], [0, 1], {
    extrapolateRight: "clamp",
  });
  const exit = interpolate(
    frame,
    [durationInFrames - exitFrames, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" },
  );

  const opacity = Math.min(enter, exit);
  const scale = 0.96 + Math.min(enter, exit) * 0.04;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      {children}
    </div>
  );
};
