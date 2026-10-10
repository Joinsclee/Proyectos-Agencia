# Los diez Reels orgánicos · palabra por pieza

Copia de los diez anuncios con el final cambiado: se quita el «haz clic» y en su
lugar la pieza pide **comentar una palabra**, que dispara el privado con el enlace.
Los anuncios originales no se tocaron: siguen en `sistema/entrega/`.

**Cada Reel lleva su propia palabra**, sacada de lo que promete ese vídeo. Son diez
reglas de automatización, una por publicación, y a cambio se sabe qué ángulo trajo
cada registro. Si se prefiere operar con una sola regla, `ORDEN` vale para los diez.

| # | ángulo | palabra | anuncio | Reel |
|---|---|---|---|---|
| 1 | El sueño que se come los ahorros | **ORDEN** | 56.1 s | 54.48 s |
| 2 | La finca bonita que sale cara | **MAPA** | 49.9 s | 49.88 s |
| 3 | La finca que cobra todos los meses | **CONECTA** | 52.2 s | 47.56 s |
| 4 | La finca parada | **PRIMERO** | 44.3 s | 44.00 s |
| 5 | El chiste del agrónomo | **RUTA** | 52.6 s | 50.60 s |
| 6 | Veinte años en agroquímicos | **CICLOS** | 52.5 s | 52.80 s |
| 7 | El 70 % del restaurante | **PREGUNTAS** | 51.4 s | 50.48 s |
| 8 | A quién le vendes | **CLIENTE** | 44.9 s | 45.00 s |
| 9 | Policultivo no es sembrar al azar | **PILARES** | 44.8 s | 42.28 s |
| 10 | La huerta no nació así | **HUERTA** | 53.5 s | 52.08 s |

Todas a 1080×1920, 25 fps, entre −13,8 y −14,5 LUFS con picos de −1,2 a −1,4 dBTP:
conviven en el mismo perfil que los anuncios, así que ninguna suena más alta que otra.

## Cómo está hecho el final

Tres tramos, y los tres sobre la grabación del móvil recorriendo la landing:

1. **la página a la vista**, con la voz del anuncio siguiendo por debajo;
2. **la cartela con la palabra**, que entra mientras todavía se está hablando;
3. **medio segundo de ambiente real** y se acaba.

Que la cartela entre sobre la voz no es un detalle de estilo: es lo que evita tener
que rellenar el final con sonido inventado. Las dos versiones anteriores lo pusieron
detrás de la voz y las dos se cayeron por ahí — una con un fotograma congelado que
se leía como un cuelgue, otra con la cama de ambiente repitiéndose en bucle.

## Rehacer uno

```bash
cd sistema && python3 organico.py anuncio-04
```

Cada pieza se describe en su `organico-anuncio-NN.json`: dónde acaba el cuerpo,
qué tramos de voz siguen sonando, cuándo entra la cartela y qué palabra lleva.
El sistema entero está empaquetado como skill `montaje-vertical-clee`.
