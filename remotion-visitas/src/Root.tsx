import { Composition } from "remotion";
import { VisitasVideo } from "./VisitasVideo";
import { SistemaCreceVideo } from "./SistemaCreceVideo";
import { SurveyVideo, SURVEY_VIDEO_DURATION } from "./SurveyVideo";
import { SaviasVideo, SAVIAS_DURATION } from "./SaviasVideo";

export const RemotionRoot = () => {
  return (
    <>
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
    </>
  );
};
