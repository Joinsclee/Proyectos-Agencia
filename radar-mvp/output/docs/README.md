# Documentos de avance del Radar

Los informes con fecha anterior son fotografías históricas del estado que existía
en su día de corte. No deben mezclarse para calcular un único porcentaje global.

Para presentar el estado funcional vigente al cliente se deben usar:

- `Panorama_General_Historias_Usuario_Radar_2026-07-26.docx`, como catálogo general
  de historias de usuario sin porcentaje de avance.
- `Matriz_Trazabilidad_Historias_Usuario_Radar_2026-07-25.docx`, como trazabilidad
  entre historias, evidencia y próximos pasos.
- `Seguimiento_Historias_Usuario_Radar_2026-07-25.docx`, como seguimiento detallado
  de las fases 1 y 2.

Los documentos `Informe_Avance_*` se conservan sólo como evidencia de cortes
anteriores y pueden mostrar cifras distintas por fecha o metodología.

## Regeneración

```bash
python -m pip install -r output/docs/requirements.txt
python output/docs/build_matriz_hu_cliente.py
python output/docs/build_panorama_hu_cliente.py
python output/docs/build_seguimiento_hu_cliente.py
```

Antes de entregar, se deben ejecutar `npm test`, `npm run test:e2e` y
`npm run typecheck`, y conservar en el documento únicamente evidencia
correspondiente al mismo corte de código.
