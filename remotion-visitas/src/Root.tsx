import { Composition } from "remotion";
import { VisitasVideo } from "./VisitasVideo";
import { SistemaCreceVideo } from "./SistemaCreceVideo";
import { CrecePeloVideo, CRECE_DURATION, CRECE_FPS } from "./CrecePeloVideo";
import { SurveyVideo, SURVEY_VIDEO_DURATION } from "./SurveyVideo";
import { SaviasVideo, SAVIAS_DURATION } from "./SaviasVideo";
import { MiBarcoVideo, MI_BARCO_DURATION } from "./MiBarcoVideo";
import { EncuestaLoopVideo, ENCUESTA_DURATION } from "./EncuestaLoopVideo";
import { LinaSubsVideo, LINA_SUBS_DURATION } from "./LinaSubsVideo";
import { SaviasGraciasSubs, SAVIAS_GRACIAS_DURATION } from "./SaviasGraciasSubs";
import { SaviasRegistroSubs, SAVIAS_REGISTRO_DURATION } from "./SaviasRegistroSubs";
import { JCMarcaPersonal, JC_MARCA_PERSONAL_DURATION } from "./jc/JCMarcaPersonal";
import { JCComunicacion, JC_COM_DURATION, JC_COM_FPS } from "./jc/JCComunicacion";
import { RadarLoginVideo, RADAR_LOGIN_DURATION, RADAR_LOGIN_FPS } from "./radar/RadarLoginVideo";
import { LinaLoginVideo, LINA_LOGIN_DURATION, LINA_LOGIN_FPS } from "./LinaLoginVideo";
import { VslVentaVideo, VSL_VENTA_DURATION, VSL_VENTA_FPS } from "./VslVentaVideo";
import { CountdownVideo, COUNTDOWN_DURATION, COUNTDOWN_FPS } from "./CountdownVideo";
import { ClaseBody, CLASE_BODY_CONFIGS, CLASE_FPS } from "./clase/ClaseBody";
import { ShampooCrecepeloVideo, SHAMPOO_DURATION, SHAMPOO_FPS } from "./ShampooCrecepeloVideo";
import { CupcakeJabon, CUPCAKE_DURATION, CUPCAKE_FPS } from "./CupcakeJabon";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="CupcakeJabon"
        component={CupcakeJabon}
        durationInFrames={CUPCAKE_DURATION}
        fps={CUPCAKE_FPS}
        width={1920}
        height={1080}
        defaultProps={{ grade: true }}
      />
      <Composition
        id="ShampooCrecepelo"
        component={ShampooCrecepeloVideo}
        durationInFrames={SHAMPOO_DURATION}
        fps={SHAMPOO_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="CountdownVideo"
        component={CountdownVideo}
        durationInFrames={COUNTDOWN_DURATION}
        fps={COUNTDOWN_FPS}
        width={1920}
        height={1080}
      />
      {/* ── Clases finales: video de Lina con overlays (intro hablada animada) ── */}
      <Composition
        id="ClasePostre"
        component={ClaseBody}
        durationInFrames={CLASE_BODY_CONFIGS.postre.bodyFrames}
        fps={CLASE_FPS}
        width={1920}
        height={1080}
        defaultProps={{ cfg: CLASE_BODY_CONFIGS.postre }}
      />
      <Composition
        id="ClaseCromoterapia"
        component={ClaseBody}
        durationInFrames={CLASE_BODY_CONFIGS.cromoterapia.bodyFrames}
        fps={CLASE_FPS}
        width={1920}
        height={1080}
        defaultProps={{ cfg: CLASE_BODY_CONFIGS.cromoterapia }}
      />
      <Composition
        id="VslVentaVideo"
        component={VslVentaVideo}
        durationInFrames={VSL_VENTA_DURATION}
        fps={VSL_VENTA_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="LinaLoginVideo"
        component={LinaLoginVideo}
        durationInFrames={LINA_LOGIN_DURATION}
        fps={LINA_LOGIN_FPS}
        width={1080}
        height={1350}
      />
      <Composition
        id="RadarLoginVideo"
        component={RadarLoginVideo}
        durationInFrames={RADAR_LOGIN_DURATION}
        fps={RADAR_LOGIN_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="CrecePeloVideo"
        component={CrecePeloVideo}
        durationInFrames={CRECE_DURATION}
        fps={CRECE_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="JCComunicacion"
        component={JCComunicacion}
        durationInFrames={JC_COM_DURATION}
        fps={JC_COM_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="JCMarcaPersonal"
        component={JCMarcaPersonal}
        durationInFrames={JC_MARCA_PERSONAL_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SaviasGraciasSubs"
        component={SaviasGraciasSubs}
        durationInFrames={SAVIAS_GRACIAS_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SaviasRegistroSubs"
        component={SaviasRegistroSubs}
        durationInFrames={SAVIAS_REGISTRO_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="LinaSubsVideo"
        component={LinaSubsVideo}
        durationInFrames={LINA_SUBS_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
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
