import { Composition } from "remotion";
import { VisitasVideo } from "./VisitasVideo";
import { SistemaCreceVideo } from "./SistemaCreceVideo";
import { SurveyVideo, SURVEY_VIDEO_DURATION } from "./SurveyVideo";
import { SaviasVideo, SAVIAS_DURATION } from "./SaviasVideo";
import { MiBarcoVideo, MI_BARCO_DURATION } from "./MiBarcoVideo";
import { EncuestaLoopVideo, ENCUESTA_DURATION } from "./EncuestaLoopVideo";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="EncuestaLoopVideo"
        component={EncuestaLoopVideo}
        durationInFrames={ENCUESTA_DURATION}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="VisitasVideo"
        component={VisitasVideo}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SistemaCreceVideo"
        component={SistemaCreceVideo}
        durationInFrames={960}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SurveyVideo"
        component={SurveyVideo}
        durationInFrames={SURVEY_VIDEO_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SaviasVideo"
        component={SaviasVideo}
        durationInFrames={SAVIAS_DURATION}
        fps={30}
        width={1080}
        height={1350}
      />
      <Composition
        id="MiBarcoVideo"
        component={MiBarcoVideo}
        durationInFrames={MI_BARCO_DURATION}
        fps={30}
        width={1080}
        height={1350}
      />
    </>
  );
};
