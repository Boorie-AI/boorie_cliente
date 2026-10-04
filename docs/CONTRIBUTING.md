# Guía de Contribución a Boorie

¡Gracias por tu interés en contribuir a Boorie! Este documento proporciona las pautas y mejores prácticas para contribuir al proyecto.

## 📋 Tabla de Contenidos

- [Código de Conducta](#código-de-conducta)
- [¿Cómo puedo contribuir?](#cómo-puedo-contribuir)
- [Proceso de Desarrollo](#proceso-de-desarrollo)
- [Publicar una versión](PROCESO_DE_RELEASE.md)
- [Guía de Estilo](#guía-de-estilo)
- [Enviando Pull Requests](#enviando-pull-requests)
- [Reportar desde la app](#reportar-desde-la-app)
- [Reportando Bugs](#reportando-bugs)
- [Sugiriendo Mejoras](#sugiriendo-mejoras)
- [Documentación](#documentación)
- [Comunidad](#comunidad)

## 📜 Código de Conducta

Este proyecto y todos los participantes están regidos por el [Código de Conducta de Boorie](CODE_OF_CONDUCT.md). Al participar, se espera que respetes este código.

## 🤝 ¿Cómo puedo contribuir?

### 🔧 Desarrollo de Código

1. **Corrección de Bugs**: Revisa los [issues etiquetados como 'bug'](https://github.com/boorie/boorie/labels/bug)
2. **Nuevas Características**: Consulta los [issues etiquetados como 'enhancement'](https://github.com/boorie/boorie/labels/enhancement)
3. **Optimización**: Mejora el rendimiento o la eficiencia del código existente
4. **Tests**: Aumenta la cobertura de pruebas

### 📚 Documentación

1. **Documentación Técnica**: Mejora o expande la documentación existente
2. **Traducciones**: Ayuda a traducir la documentación a otros idiomas
3. **Tutoriales**: Crea guías y tutoriales para nuevos usuarios
4. **Ejemplos**: Aporta casos de uso y ejemplos prácticos

### 🧠 Base de Conocimiento RAG

1. **Normativas Hidráulicas**: Aporta documentación sobre regulaciones locales
2. **Mejores Prácticas**: Comparte conocimiento técnico especializado
3. **Casos de Estudio**: Documenta implementaciones exitosas

### 🌍 Comunidad

1. **Soporte**: Ayuda a otros usuarios en Discord o el foro
2. **Divulgación**: Comparte el proyecto y casos de uso
3. **Eventos**: Organiza o participa en meetups y hackatones

## 🔄 Proceso de Desarrollo

### 1. Fork y Clone

```bash
# Fork el repositorio en GitHub
# Clone tu fork
git clone https://github.com/tu-usuario/boorie.git
cd boorie

# Añade el repositorio original como upstream
git remote add upstream https://github.com/boorie/boorie.git
```

### 2. Configuración del Entorno

```bash
# Crear entorno virtual
python -m venv env
source env/bin/activate  # Linux/macOS
# o
env\Scripts\activate  # Windows

# Instalar dependencias de desarrollo
pip install -e ".[dev]"

# Instalar pre-commit hooks
pre-commit install
```

### 3. Crear una Rama

```bash
# Sincroniza con upstream
git fetch upstream
git checkout main
git merge upstream/main

# Crea tu rama
git checkout -b feature/nueva-caracteristica
# o
git checkout -b fix/correccion-bug
```

### 4. Desarrollo

- Escribe código limpio y legible
- Añade tests para nuevas funcionalidades
- Actualiza la documentación si es necesario
- Asegúrate de que todos los tests pasen

```bash
# Ejecutar tests
pytest

# Verificar estilo de código
flake8 boorie/
black --check boorie/

# Ejecutar pre-commit
pre-commit run --all-files
```

## 📝 Guía de Estilo

### Python

- Seguimos [PEP 8](https://www.python.org/dev/peps/pep-0008/)
- Usamos [Black](https://github.com/psf/black) para formateo automático
- Type hints son obligatorios para funciones públicas
- Docstrings en formato Google Style

```python
def calculate_flow(
    pipe_diameter: float,
    pressure_difference: float,
    pipe_length: float
) -> float:
    """Calculate flow rate through a pipe using Darcy-Weisbach equation.
    
    Args:
        pipe_diameter: Internal diameter of the pipe in meters
        pressure_difference: Pressure difference in Pascals
        pipe_length: Length of the pipe in meters
        
    Returns:
        Flow rate in cubic meters per second
        
    Raises:
        ValueError: If any parameter is negative
    """
    # Implementación...
```

### Commits

- Usa mensajes descriptivos en español o inglés
- Formato: `tipo(alcance): descripción`
- Tipos: feat, fix, docs, style, refactor, test, chore

```bash
# Buenos ejemplos
git commit -m "feat(agent): añadir análisis de pérdidas por fricción"
git commit -m "fix(api): corregir error en validación de parámetros"
git commit -m "docs: actualizar guía de instalación"

# Malos ejemplos
git commit -m "cambios"
git commit -m "arreglado"
```

## 🚀 Enviando Pull Requests

1. **Antes de enviar**:
   - Asegúrate de que tu código pasa todos los tests
   - Actualiza la documentación si es necesario
   - Añade una entrada en CHANGELOG.md

2. **Título del PR**:
   - Usa el mismo formato que los commits
   - Sé claro y conciso

3. **Descripción del PR**:
   - Explica qué cambios realizaste y por qué
   - Referencia los issues relacionados (#123)
   - Incluye capturas de pantalla si aplica

4. **Checklist**:
   - [ ] Los tests pasan localmente
   - [ ] He añadido tests para mis cambios
   - [ ] La documentación está actualizada
   - [ ] El código sigue la guía de estilo
   - [ ] He ejecutado pre-commit

## 🆘 Reportar desde la app

La forma más rápida de reportar un problema o sugerir una mejora es desde la
propia aplicación, sin buscar la plantilla a mano:

1. Abre **Ayuda y comentarios**: está en la barra lateral y en
   **Configuración → Acerca de**.
2. Elige **Reportar un problema** o **Sugerir una mejora** y rellena el
   formulario. Prepara el reporte con el mismo formato que las plantillas de abajo.
3. Envíalo de una de estas dos formas:
   - **Abrir en GitHub** abre en el navegador un issue nuevo ya relleno; lo
     revisas y pulsas «Submit new issue». Hace falta una cuenta de GitHub. Si
     el texto no cabe entero en el enlace, el informe completo queda en el
     portapapeles para pegarlo.
   - **Copiar informe** lo deja en el portapapeles para enviarlo por el canal
     de siempre, si no tienes cuenta de GitHub.

La casilla **Incluir información técnica** añade la versión de Boorie, el
sistema operativo, la versión de Python (y si es el entorno que gestiona
Boorie), la pantalla en la que estabas y los últimos avisos y errores de la
app. Antes de salir se quitan las rutas personales y los correos, también del
texto que escribas. **Ver exactamente lo que se enviará** enseña el informe
tal cual. El issue es público: no incluyas datos de clientes, nombres de redes
ni información confidencial.

## 🐛 Reportando Bugs

Si no lo haces desde la app, usa la [plantilla de reporte de bugs](.github/ISSUE_TEMPLATE/bug_report.md) e incluye:

- Descripción clara del problema
- Pasos para reproducir
- Comportamiento esperado vs actual
- Versión de Boorie y Python
- Sistema operativo
- Logs relevantes

## 💡 Sugiriendo Mejoras

Si no lo haces desde la app, usa la [plantilla de feature request](.github/ISSUE_TEMPLATE/feature_request.md) e incluye:

- Descripción clara de la mejora
- Motivación y casos de uso
- Alternativas consideradas
- Implementación propuesta (opcional)

## 📖 Documentación

### Estructura

```
docs/
├── technical/       # Documentación técnica
│   ├── api/        # Referencia de API
│   ├── architecture/ # Decisiones arquitectónicas
│   └── algorithms/  # Algoritmos hidráulicos
├── tutorials/       # Tutoriales paso a paso
└── api/            # Documentación de API REST
```

### Escribiendo Documentación

- Usa Markdown para todos los documentos
- Incluye ejemplos de código cuando sea relevante
- Mantén un tono profesional pero accesible
- Verifica enlaces y referencias

## 👥 Comunidad

### Canales de Comunicación

- **Discord**: [discord.gg/boorie](https://discord.gg/boorie)
- **Foro**: [forum.boorie.org](https://forum.boorie.org)
- **Twitter**: [@boorieAI](https://twitter.com/boorieAI)

### Reuniones

- **Llamadas de Contribuyentes**: Primer martes de cada mes, 16:00 UTC
- **Office Hours**: Todos los jueves, 15:00-17:00 UTC en Discord

### Reconocimiento

- Todos los contribuyentes son añadidos a [CONTRIBUTORS.md](CONTRIBUTORS.md)
- Contribuyentes regulares pueden ser invitados como mantenedores
- Destacamos contribuciones significativas en nuestro blog

## 🙏 ¡Gracias!

Tu contribución hace posible que Boorie ayude a ingenieros hidráulicos en todo el mundo. ¡Gracias por ser parte de nuestra comunidad!

---

¿Preguntas? Contacta al equipo en contributors@boorie.org o pregunta en Discord.