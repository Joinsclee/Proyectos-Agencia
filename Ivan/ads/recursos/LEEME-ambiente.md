# `ambiente-finca.wav` — la cama de ambiente de los orgánicos

Un Reel orgánico acaba con una cartela de «comenta la palabra» y sin voz debajo.
Cortar a silencio digital ahí se oye como un fallo del archivo, así que la cartela
va sobre ambiente real de la finca.

**De dónde sale.** Del único trozo de room tone limpio que hay en los diez brutos:
la cola del `ANUNCIO 1.mp4`, entre 55,46 y 56,06. Los demás no sirven — siete de
los diez traen menos de 0,7 s después de la última palabra, y tres traen 0,1 s o
menos. La del bruto 8 parecía la más larga (2,64 s) y no lo es: ese bruto es el
original, no el corregido, y esos segundos son la frase que se quitó.

**Cómo está hecha.**

```bash
ffmpeg -y -ss 55.46 -t 0.60 -i "brutos/ANUNCIO 1.mp4" \
  -filter_complex "[0:a]asplit[a][b];[b]areverse[r];[a][r]concat=n=2:v=0:a=1,\
highpass=f=90,acompressor=threshold=-48dB:ratio=12:attack=30:release=350,volume=6.5dB[o]" \
  -map "[o]" -ar 48000 -ac 2 recursos/ambiente-finca.wav
```

Tres decisiones, cada una por un defecto medido:

| | por qué |
|---|---|
| el trozo **más su reverso** (1,20 s) | el final del reverso es idéntico al principio del trozo, así que el bucle empalma sin clic en la costura |
| `acompressor` | sin él el bucle pulsaba **14 dB** cada 1,2 s y se oía el bucle. Con él baja a 4,4 dB descontando un valle suelto |
| `volume=6.5dB` | la compresión dejaba la cama en −53,6 dB RMS, 6 dB por debajo del room tone real (−47,3). Con esta ganancia vuelve a su nivel natural |

**Es la misma para los diez.** Se grabaron el mismo día en el mismo sitio, así que
usar una sola cama es más consistente que sacar una de cada bruto — y en los
anuncios 4, 7 y 9 sacarla es imposible: no tienen cola.
