import type { ReactElement } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { COLORS } from "../theme";
import "./fonts";
import { Background } from "../components/Background";
import { Particles } from "../components/Particles";
import {
  SceneHook,
  SceneScale,
  SceneRadar,
  SceneComparables,
  SceneValue,
  SceneCTA,
} from "./scenes";

// 30 fps. Loop pensado como fondo de la zona de login.
export const RADAR_LOGIN_FPS = 30;
const D = { hook: 120, scale: 120, radar: 150, comp: 150, value: 96, cta: 110 };
export const RADAR_LOGIN_DURATION =
  D.hook + D.scale + D.radar + D.comp + D.value + D.cta; // 746 frames ≈ 24.9s

export const RadarLoginVideo = () => {
  let at = 0;
  const seq = (dur: number, node: (d: number) => ReactElement) => {
    const from = at;
    at += dur;
    return (
      <Sequence from={from} durationInFrames={dur}>
        {node(dur)}
      </Sequence>
    );
  };
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep }}>
      <Background />
      <Particles />
      {seq(D.hook, (d) => <SceneHook dur={d} />)}
      {seq(D.scale, (d) => <SceneScale dur={d} />)}
      {seq(D.radar, (d) => <SceneRadar dur={d} />)}
      {seq(D.comp, (d) => <SceneComparables dur={d} />)}
      {seq(D.value, (d) => <SceneValue dur={d} />)}
      {seq(D.cta, (d) => <SceneCTA dur={d} />)}
    </AbsoluteFill>
  );
};
