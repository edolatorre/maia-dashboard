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

## Integraciones (Ajustes → Integraciones)

- **Meta**: token de usuario del sistema con `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `read_insights`, `ads_read`, `business_management`. Sincroniza cada 6 horas.
- **Anthropic**: API key para guiones, ideas y correos de pitch.

Los tokens se guardan en `DATA_DIR/secrets.json` (permisos 600) y nunca se devuelven por la API.

## Actualizar el servidor

Desde el panel: **Ajustes → Buscar e instalar actualización** (hace `git pull` y reinicia).
