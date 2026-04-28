import { AbsoluteFill, Sequence } from "remotion";
import { Background } from "./components/Background";
import { Particles } from "./components/Particles";
import { Scene1Intro } from "./scenes/Scene1Intro";
import { Scene3Journey } from "./scenes/Scene3Journey";
import { Scene4Phases } from "./scenes/Scene4Phases";
import { Scene5Kit } from "./scenes/Scene5Kit";
import { Scene6BonosExclusivos } from "./scenes/Scene6BonosExclusivos";
import { Scene7BonosUrgency } from "./scenes/Scene7BonosUrgency";
import { Scene8Price } from "./scenes/Scene8Price";
import { Scene9CTA } from "./scenes/Scene9CTA";

// Timing (30 fps):
// Scene 1 Intro             : 0    -> 60    (2.0s)
// Scene 3 Journey           : 60   -> 180   (4.0s)
// Scene 4 Phases            : 180  -> 285   (3.5s)
// Scene 5 Kit               : 285  -> 450   (5.5s) ★ Kit del Inversionista
// Scene 6 Bonos Exclusivos  : 450  -> 600   (5.0s) ★ Bonos incluidos
// Scene 7 Bonos Urgency     : 600  -> 780   (6.0s) ★★ Bonos acción rápida con countdown
// Scene 8 Price             : 780  -> 870   (3.0s)
// Scene 9 CTA               : 870  -> 960   (3.0s)
// Total                     : 960 frames   (32s)

export const SistemaCreceVideo = () => {
  return (
    <AbsoluteFill>
      <Background />
      <Particles />

      <Sequence from={0} durationInFrames={60}>
        <Scene1Intro />
      </Sequence>

      <Sequence from={60} durationInFrames={120}>
        <Scene3Journey />
      </Sequence>

      <Sequence from={180} durationInFrames={105}>
        <Scene4Phases />
      </Sequence>

      <Sequence from={285} durationInFrames={165}>
        <Scene5Kit />
      </Sequence>

      <Sequence from={450} durationInFrames={150}>
        <Scene6BonosExclusivos />
      </Sequence>

      <Sequence from={600} durationInFrames={180}>
        <Scene7BonosUrgency />
      </Sequence>

      <Sequence from={780} durationInFrames={90}>
        <Scene8Price />
      </Sequence>

      <Sequence from={870} durationInFrames={90}>
        <Scene9CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
