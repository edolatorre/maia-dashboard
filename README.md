# Panel Maia Cruz

Panel privado para administrar la cuenta de Maia Cruz (@maiacruz.ia): grilla de contenido, pipeline de marcas, presupuesto, tareas del plan de 90 días y recursos.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `ADMIN_PASSWORD` | **Obligatoria.** Contraseña de acceso. Sin ella el login está deshabilitado. |
| `ADMIN_USER` | Usuario de acceso (por defecto `edo`). |
| `DATA_DIR` | Carpeta donde se guarda `db.json` (por defecto `./data`). En DigitalOcean o Render con disco, apuntar a un volumen persistente. |
| `SESSION_SECRET` | Opcional. Si no existe, se deriva de la contraseña. |

## Correr local

```bash
npm install
ADMIN_PASSWORD=algo-seguro npm start
```

## Datos

Al primer arranque se carga `seed.json`. En el plan gratis de Render el disco no es persistente: usa **Exportar** para descargar un respaldo y **Importar** para restaurarlo.
