# Weave EPUB Reader

[中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [English](./README.md#english-documentation) | [Español](./README.es.md) | [Français](./README.fr.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md)

<div align="center">

![QQ_1784327250240](https://github.com/user-attachments/assets/dc88b393-76ec-413c-b226-31ab01a7e82a)

![QQ20260718-070731-HD](https://github.com/user-attachments/assets/c1850008-aa57-48e1-b63f-d34a01326a53)

![QQ20260718-064929-HD](https://github.com/user-attachments/assets/5fc7ff83-b8e3-498f-8233-90fbcc94198b)

![QQ_1784328028569](https://github.com/user-attachments/assets/1185b662-3f91-4dee-b552-e53e3ebcb25d)

![QQ_1785812351950](https://github.com/user-attachments/assets/5c33039e-7ca4-461b-b258-972561f9789d)

</div>

---

## Introducción

**Weave Epub Reader** es un complemento de lectura de la **serie de complementos Obsidian Weave**, creado por completo para Obsidian y disponible en todas las plataformas de Obsidian. Admite de forma gratuita la lectura de EPUB, TXT, FB2/FBZ, MOBI, AZW3, CBZ, PDF y más, además de notas de extracto con varios estilos de anotación. Los extractos pueden guardarse en archivos **Markdown**, **Canvas** y **mazos Weave**, con enlaces de origen bidireccionales para saltar al pasaje, y los datos permanecen completamente locales.

Además de las necesidades esenciales y la experiencia principal, los usuarios avanzados disponen de **lectura inmersiva**, **lectura por párrafos**, **marcado de vocabulario**, **resúmenes de extractos en línea de tiempo**, **listas de referencias de extractos** y **más**—usando herramientas dentro de Obsidian para pensar, afilar el criterio y dar sentido a la lectura.

> Consejo: si tienes preguntas, puedes escribir a tutaoyuan8@outlook.com

## Lista de funciones principales

### Lectura y estantería

- Lectura en todas las plataformas: escritorio y móvil
- Lectura de EPUB, TXT, FB2/FBZ, MOBI, AZW3, CBZ y PDF
- Mi estantería: importar, portadas, progreso, búsqueda/filtro, estado de lectura
- Paginado / desplazamiento continuo, una / dos columnas, controles de ancho y tipografía
- Progreso de lectura persistente, marcadores, estimación de tiempo restante
- Puntos de lectura de referencia (registrar / actualizar / saltar)
- Resplandor de fondo de lectura (Premium)
- Modo de lectura por párrafos, pantalla completa inmersiva (Premium)
- Listas de reproducción de la estantería (Premium)

### Extractos y anotaciones

- Cinco colores de resaltado más subrayado / tachado / subrayado ondulado
- Burbujas de pensamiento (`---div---`)
- Modo automático: insertar en notas / copiar al portapapeles
- Renderizado en el cuerpo y sincronización para Markdown / Canvas / mazos Weave
- Extractos por captura de pantalla (pueden continuar entre páginas)

### Resúmenes de extractos

- Lista de tarjetas de extractos (filtrar, ordenar, saltar a la fuente)
- Vista de línea de tiempo de extractos (revisar por fecha, saltar a la fuente; Premium)
- Selección por lotes: exportar / eliminar
- Barra de densidad del mapa del libro en la barra lateral del TOC (Premium)
- Marcas de capítulo en el índice (importante / duda / dominado; puntos de color; Premium)

### Trazado e integraciones

- Enlaces profundos al libro escritos en los extractos
- Trazado bidireccional preciso: notas ↔ libro (Premium)
- Vinculación con Canvas, creación automática de nodos y renderizado
- Creación de tarjetas / lectura incremental / IA (requiere Weave; no consume la licencia Premium del lector)

### API pública

- Obtener el contexto de lectura actual (título del libro, título / índice del capítulo actual, etc.)
- Obtener el cuerpo del capítulo actual, o el cuerpo de una sección TOC especificada (text / markdown)
- Obtener los extractos resaltados del capítulo actual, o listar todas las notas de extracto del libro actual / de un libro especificado
- Leer la estructura del TOC, listar los lectores abiertos; opcionalmente eliminar un extracto por localizador
- Sin búsqueda del cuerpo de todo el libro / RAG; para capítulos largos, se recomienda obtener secciones del TOC

### Exportación y ayudas

- Exportar el capítulo actual a Markdown (Essential)
- Exportar extractos de todo el libro / del capítulo y capítulos marcados (Premium)
- Estudio de plantillas de exportación con presets integrados
- Vista previa de notas al pie al pasar el cursor (Premium)
- Interfaz multilingüe (简体中文、繁體中文、English、日本語、한국어、Русский、Deutsch、Español、العربية) + tutorial en la app

Consulta [Experiencia esencial y soporte Premium](#experiencia-esencial-y-soporte-premium) para ver cómo se agrupan las capacidades.

Versión mínima de Obsidian: **1.8.7**

## Experiencia esencial y soporte Premium

| Capacidad | Experiencia esencial | Soporte Premium |
|-----------|:--------------------:|:---------------:|
| **Todas las plataformas** (escritorio y móvil) | ✅ | ✅ |
| Leer **EPUB**, TOC, modos paginado/desplazamiento, tipografía y temas | ✅ | ✅ |
| Leer libros de texto plano **TXT** | ✅ | ✅ |
| Leer **FB2 / FBZ** | ✅ | ✅ |
| Leer **MOBI / AZW3 / CBZ** | ✅ | ✅ |
| **Cinco colores de resaltado**, anotaciones, extractos y **renderizado en el cuerpo** | ✅ | ✅ |
| Estilos de **subrayado / tachado / subrayado ondulado** | ✅ | ✅ |
| Vista de **lista de tarjetas** de extractos | ✅ | ✅ |
| Vista de **línea de tiempo** de extractos | 🔒 | ✅ |
| **Barra de densidad del mapa del libro** en la barra lateral del TOC | 🔒 | ✅ |
| **Marcas de capítulo** en el índice (importante / duda / dominado) | 🔒 | ✅ |
| **Listas de reproducción** de la estantería | 🔒 | ✅ |
| **Trazado bidireccional** (saltos de ancla, notas ↔ ubicación en el libro) | 🔒 | ✅ |
| **Puntos de lectura de referencia** (registrar / actualizar / saltar) | ✅ | ✅ |
| **Resplandor de fondo de lectura** | 🔒 | ✅ |
| **Modo de lectura por párrafos**, pantalla completa inmersiva | 🔒 | ✅ |
| **Progreso de lectura**, progreso en la estantería, última ubicación, estimación de tiempo restante | ✅ | ✅ |
| **Marcadores de la página actual**, carpeta de marcadores y navegación por lista de marcadores | ✅ | ✅ |
| Vinculación **Canvas** y creación automática de nodos | ✅ | ✅ |
| Vista previa de notas al pie al pasar el cursor | 🔒 | ✅ |
| Exportar el capítulo actual a Markdown | ✅ | ✅ |
| **API pública** (capítulo actual / cuerpo de sección TOC, notas de extracto del capítulo o de todo el libro, etc.) | ✅ | ✅ |

> Leyenda: ✅ incluido · 🔒 requiere soporte Premium

- **Activar el soporte Premium**: usa un código de activación exclusivo de EPUB en los ajustes del lector; si tienes instalado y activado el complemento principal **Weave**, la autorización puede heredarse sin volver a introducir un código.
- **Creación de tarjetas / lectura incremental / IA**: no consumen una licencia aparte de soporte Premium del lector, pero requieren Weave; la IA también necesita tu propia clave API.

Desglose autorizado: [Experiencia esencial y soporte Premium](#experiencia-esencial-y-soporte-premium) más arriba. Activa en los ajustes del lector. Condiciones: [PREMIUM_TERMS.md](./PREMIUM_TERMS.md).

## Instalación

### Opción 1: Complementos de la comunidad (recomendado)

1. Abre **Ajustes → Complementos de la comunidad → Explorar**
2. Busca **Weave EPUB Reader**, instálalo y actívalo

### Opción 2: Instalación manual

1. Descarga una [versión de GitHub](https://github.com/zhuzhige123/obsidian-weave-reader/releases) que coincida con la versión de `manifest.json`:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Cópialos en `.obsidian/plugins/weave-epub-reader/`
3. Reinicia Obsidian y activa **Weave EPUB Reader** en **Ajustes → Complementos de la comunidad**

## Inicio rápido

1. Tras activar el complemento, abre la **estantería** desde la cinta o la paleta de comandos; luego importa o abre un libro de tu vault.
2. Crea o abre un archivo Markdown y coloca el cursor donde deben ir los extractos; activa **Extracto automático** en el lector. Selecciona texto para crear resaltados, extractos o marcadores—se insertan en ese cursor.
3. Haz clic en un resaltado del libro para saltar a su nota de origen desde la barra de herramientas; en el Markdown / Canvas que guarda el extracto, haz clic en el icono del libro junto a él para volver al pasaje correspondiente.
4. Menú del lector → **Ayuda** → **Tutorial** para la guía breve en la app.

## Datos y sincronización

**Conviene sincronizar (en el vault)**: archivos de libros, extractos Markdown, archivos Canvas, datos de mazos Weave y notas de progreso/marcadores por libro (por defecto `Weave EPUB Reader/data_*.md`).

**Suele ser local (carpeta del complemento)**: caché del lector, índices, vinculaciones de Canvas, puntos de lectura de referencia y estado local similar. Prefiere sincronizar el contenido del vault entre dispositivos en lugar de los archivos de caché de `.obsidian/plugins/weave-epub-reader/`.

## Privacidad y red

- La lectura, el renderizado, los extractos y los backlinks son **locales por defecto**; el contenido del vault no se sube de forma proactiva.
- Las funciones de estantería, backlinks y localización de fuente enumeran rutas de archivos del vault de forma local; copiar extractos o códigos de activación usa el portapapeles. Consulta [PRIVACY.md](./PRIVACY.md).
- La **activación del soporte Premium** puede contactar el servicio de licencias (código de activación, correo, resumen de huella del dispositivo, etc.). Consulta [PRIVACY.md](./PRIVACY.md).
- Las **funciones de IA** llaman a los servicios de terceros que configures.

## Preguntas frecuentes

### ¿Cómo capturo correctamente los extractos de lectura?

Los extractos se guardan en ubicaciones concretas de los archivos Markdown, Canvas o mazos Weave que elijas. El lector agrega los enlaces de origen de esas capturas y renderiza resaltados en el libro. Las selecciones que no se guardan de este modo solo parpadean brevemente y no dejan datos duraderos. El banner del tutorial en el lector lo explica con más detalle.

### ¿Cómo se relaciona con Weave?

**Weave EPUB Reader funciona por sí solo**: sin el complemento principal [Weave](https://github.com/zhuzhige123/anki-obsidian-plugin), puedes seguir leyendo EPUB, usar la estantería y capturar extractos con renderizado en el cuerpo. Con Weave instalado, también puedes conectar tarjetas de repetición espaciada, el calendario de lectura incremental, acciones de IA e heredar la licencia de Weave para el soporte Premium. Son **compañeros opcionales**, no una dependencia obligatoria.

### ¿Pueden sincronizarse extractos y notas entre plataformas?

**Sí.** Las capturas viven en Markdown, Canvas, archivos de mazos y otro contenido del vault, así que siguen la sincronización de Obsidian que ya uses (Obsidian Sync, iCloud, vaults sincronizados en la nube, etc.) entre escritorio y móvil. Sincroniza el contenido del vault; la caché del lector bajo la carpeta del complemento normalmente no necesita sincronización entre dispositivos (consulta [Datos y sincronización](#datos-y-sincronización) más arriba).

### ¿Puedo exportar mis notas?

**Sí.** Los datos de extractos y resaltados permanecen en tu vault—puedes leer, editar y exportar Markdown en Obsidian, y el lector ofrece exportación de capítulos y herramientas relacionadas. **Los datos son locales por defecto**; tu vault no se sube de forma proactiva.

### ¿Por qué el soporte Premium es de pago?

El soporte Premium **financia el desarrollo continuo** para que el lector y el flujo de extractos sigan mejorando. La **experiencia esencial es gratuita**—la lectura diaria, cinco colores de resaltado, anotaciones, extractos y renderizado en el cuerpo son plenamente utilizables sin pagar. Activa el soporte Premium solo cuando quieras la línea de tiempo de extractos, el trazado bidireccional, el modo de lectura por párrafos y otras capacidades avanzadas.

### ¿Suscripción o compra única?

El soporte Premium es **compra única** (activa una vez, úsalo a largo plazo; consulta [términos del soporte Premium](./PREMIUM_TERMS.md)), no una suscripción mensual.

### ¿No puedo abrir formatos que no son EPUB?

**EPUB, TXT, FB2/FBZ, MOBI, AZW3, CBZ y PDF** están incluidos en la experiencia esencial. Consulta [Experiencia esencial y soporte Premium](#experiencia-esencial-y-soporte-premium) más arriba.

## Más documentación

- [Introducción (chino simplificado)](./README.md#中文文档)
- [Introducción (chino tradicional)](./README.zh-TW.md)
- [Español](./README.es.md) · [Français](./README.fr.md) · [العربية](./README.ar.md)
- [Privacidad](./PRIVACY.md) · [Términos del soporte Premium](./PREMIUM_TERMS.md) · [Soporte](./SUPPORT.md) · [Seguridad](./SECURITY.md)

## Licencia y autor

El código fuente se publica bajo [GPL-3.0-or-later](LICENSE).

- Author: Rabbit (zhuzhige)
- GitHub: https://github.com/zhuzhige123
