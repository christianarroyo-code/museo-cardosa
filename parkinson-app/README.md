# Diario Párkinson

App web (se instala en el móvil como una app) para registrar los **periodos OFF**, las tomas de medicación, las discinesias, comidas, caídas y notas, y convertirlo en **estadísticas e informe para la neuróloga**.

- Sin servidor ni cuentas: los datos se guardan **solo en el móvil** (localStorage). Hay copia de seguridad en *Ajustes*.
- Funciona sin conexión (service worker).
- Pantalla principal con solo 4 botones grandes, pensada para una persona mayor y para usarse en pleno OFF.

## Qué registra

| Pestaña | Qué hace |
|---|---|
| **Botones** (pantalla principal) | Solo 4 botones enormes: **OFF** (me encuentro mal), **ON** (ya estoy bien), **PASTILLA** (me la he tomado) y **CAÍDA**. Cada toque guarda día y hora y muestra una confirmación a pantalla completa con "VALE" y "Me he equivocado, borrar". Durante 1 segundo ignora toques para evitar dobles pulsaciones por el temblor. Si pulsa PASTILLA dos veces en 20 min, pregunta antes de apuntar otra. El menú está escondido en "Zona familia". |
| **Historial** | Todo lo registrado; se puede corregir, borrar o añadir algo pasado. |
| **Estadísticas** | 7 / 14 / 30 / 90 días. Indicadores, patrones detectados y gráficas. |
| **Informe** | Resumen imprimible / PDF para la consulta + exportación CSV (Excel). |
| **Ajustes** | Nombre, horario de sueño, pauta de medicación, fecha del último cambio de medicación, copia de seguridad. |

## Datos que calcula

- Horas de OFF al día y % del tiempo despierta en OFF.
- Nº de episodios, duración media y máxima.
- **Tiempo desde la última toma hasta el OFF** → detecta "fin de dosis" (wearing-off).
- **OFF matutino** (antes de que haga efecto la primera toma).
- **Tiempo hasta hacer efecto** cuando se toma la medicación estando en OFF ("ON retrasado").
- **OFF tras comidas ricas en proteína** frente a comidas normales.
- Discinesias y cuánto tardan en aparecer tras la toma ("pico de dosis").
- Horas del día con más OFF, síntomas más frecuentes, intensidad.
- Caídas y cuántas ocurren en OFF.
- Puntualidad de las tomas.
- Comparación con el periodo anterior y **antes / después del último cambio de medicación**.

Los "patrones" son orientativos para comentar en consulta, no un diagnóstico.

## Probarla

En *Ajustes → Cargar datos de ejemplo* hay 30 días inventados para ver las estadísticas (se puede deshacer).

## Publicarla

Es una web estática sin compilación. Opciones:

- **Netlify**: arrastra la carpeta `parkinson-app` a https://app.netlify.com/drop (o crea un sitio con *base directory* `parkinson-app`).
- **GitHub Pages** o cualquier hosting estático.

Luego, en el móvil de tu madre: abrir la URL → *Añadir a pantalla de inicio* (Safari: botón compartir; Chrome: menú ⋮).

Para probarla en local: `python3 -m http.server` dentro de la carpeta y abrir http://localhost:8000.
