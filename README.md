# fiuba-mcp

MCP **no oficial** para el campus virtual (Moodle) de la Facultad de Ingeniería de la UBA. Le permite a tu asistente de IA (Claude, Cursor, Codex…) leer tus materias, materiales, entregas, avisos y notas.

> No está afiliado ni avalado por la FIUBA ni la UBA. Por ahora es solo lectura.

## Instalación

Requiere Node.js 22 o superior.

```sh
git clone https://github.com/<tu-usuario>/fiuba-mcp && cd fiuba-mcp
npm install
node build/index.js login                 # usuario y contraseña del campus, una sola vez
claude mcp add fiuba -- node "$PWD/build/index.js"
```

Para el campus de posgrado: `FIUBA_CAMPUS_URL=https://campusposgrado.fi.uba.ar node build/index.js login`.

La contraseña **no se guarda**: se usa una vez para obtener un token de Moodle, que queda en `~/.config/fiuba-mcp/session.json` (permisos 0600). Si expira, volvé a correr `login`.

## Herramientas

| Herramienta               | Qué hace                                                   |
| ------------------------- | ---------------------------------------------------------- |
| `fiuba_list_courses`      | Tus materias                                               |
| `fiuba_get_course`        | Secciones, recursos, archivos y actividades de una materia |
| `fiuba_read_file`         | Lee un archivo del campus (PDF, texto, HTML, CSV)          |
| `fiuba_upcoming`          | Próximas entregas y vencimientos                           |
| `fiuba_assignments`       | Entregas de una materia: estado, nota y devolución         |
| `fiuba_forum_discussions` | Últimos hilos de un foro (p. ej. Avisos)                   |
| `fiuba_read_discussion`   | Todos los mensajes de un hilo                              |
| `fiuba_grades`            | Calificaciones de una materia                              |

Ejemplos: _"¿Qué entregas tengo esta semana?"_, _"Resumime el último aviso de Análisis II"_, _"Leé el enunciado del TP1 de Algoritmos"_.

## Desarrollo

```sh
npm test        # tests en src/__test__/
npm run format  # prettier
npx @modelcontextprotocol/inspector node build/index.js
```
