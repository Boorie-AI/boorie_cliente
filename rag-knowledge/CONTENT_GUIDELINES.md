# 📖 Guías para Contribuyentes de Contenido RAG

Este documento proporciona lineamientos detallados para contribuir contenido de calidad a la base de conocimiento de Boorie.

## 🎯 Objetivo del Contenido RAG

El contenido debe ser:
- **Preciso**: Información técnicamente correcta y verificable
- **Práctico**: Aplicable en situaciones reales de ingeniería
- **Accesible**: Comprensible para ingenieros de diferentes niveles
- **Contextual**: Relevante para el contexto hidráulico específico

## 📋 Tipos de Contenido Necesario

### 1. Documentos Técnicos
```markdown
# Ejemplo: Cálculo de Pérdidas por Fricción

**Categoría**: hydraulics
**Subcategoría**: perdidas-carga
**Región**: global
**Fecha**: 2024-01-15
**Versión**: 1.0

## Resumen
Las pérdidas por fricción en tuberías son fundamentales para el diseño...

## Palabras Clave
- pérdidas por fricción
- Darcy-Weisbach
- factor de fricción
- rugosidad

## Contenido
### Ecuación de Darcy-Weisbach
La pérdida de carga por fricción se calcula mediante:

hf = f × (L/D) × (V²/2g)

Donde:
- hf = pérdida de carga (m)
- f = factor de fricción (adimensional)
- L = longitud de tubería (m)
- D = diámetro interno (m)
- V = velocidad media (m/s)
- g = aceleración de la gravedad (9.81 m/s²)

### Ejemplo Práctico
Para una tubería de PVC de 200mm, 500m de longitud...

## Referencias
- Mott, R.L. (2006). Mecánica de Fluidos. Pearson.
- AWWA M11 Steel Pipe Design Manual
```

### 2. Normativas
```markdown
# Ejemplo: NOM-127-SSA1-1994 México

**Categoría**: regulations
**Subcategoría**: calidad-agua
**Región**: México
**Fecha**: 2024-01-15
**Versión**: 1.0

## Resumen
La NOM-127-SSA1-1994 establece los límites permisibles de calidad...

## Palabras Clave
- calidad del agua
- límites permisibles
- agua potable México
- NOM-127

## Contenido
### Parámetros Físicos
| Parámetro | Límite Permisible | Unidad |
|-----------|-------------------|---------|
| Color | 20 | U Pt-Co |
| Turbiedad | 5 | UTN |
| pH | 6.5-8.5 | - |

### Parámetros Químicos
[Tabla detallada...]

## Referencias
- DOF: Norma Oficial Mexicana NOM-127-SSA1-1994
- Última modificación: DOF 22/11/2000
```

### 3. Mejores Prácticas
```markdown
# Ejemplo: Sectorización de Redes

**Categoría**: best-practices
**Subcategoría**: gestion-perdidas
**Región**: global
**Fecha**: 2024-01-15
**Versión**: 1.0

## Resumen
La sectorización es una estrategia fundamental para el control...

## Palabras Clave
- sectorización
- DMAs
- control de pérdidas
- gestión de presiones

## Contenido
### Criterios de Diseño de Sectores
1. **Tamaño óptimo**: 500-3000 conexiones
2. **Topografía**: Minimizar diferencias de elevación
3. **Límites naturales**: Aprovechar barreras físicas

### Implementación Paso a Paso
[Proceso detallado...]

## Caso de Éxito
En la ciudad de Bogotá, la implementación de 67 sectores...

## Referencias
- IWA Manual of Best Practice: District Metered Areas
- Experiencia EAAB Bogotá 2015-2020
```

## 🔍 Fuentes Confiables

### Fuentes Primarias
- Documentos oficiales gubernamentales
- Normas publicadas en diarios oficiales
- Manuales técnicos de organizaciones reconocidas (AWWA, IWA, ISO)
- Papers académicos revisados por pares

### Fuentes Secundarias Aceptables
- Libros de texto universitarios
- Guías de fabricantes reconocidos
- Reportes de consultorías especializadas
- Documentación de software especializado

### Fuentes NO Aceptables
- Wikipedia (como fuente principal)
- Blogs personales sin credenciales
- Foros sin verificación técnica
- Contenido promocional de empresas

## ✅ Checklist de Calidad

Antes de enviar tu contenido, verifica:

- [ ] **Precisión Técnica**
  - Fórmulas correctas y completas
  - Unidades consistentes (preferir SI)
  - Ejemplos numéricos verificados

- [ ] **Formato Correcto**
  - Metadata completa
  - Estructura clara con encabezados
  - Tablas y figuras bien formateadas

- [ ] **Referencias**
  - Mínimo 2 fuentes confiables
  - Enlaces funcionales (cuando aplique)
  - Fecha de consulta para fuentes web

- [ ] **Claridad**
  - Lenguaje técnico pero accesible
  - Definición de términos especializados
  - Ejemplos prácticos

- [ ] **Originalidad**
  - No copiar textualmente sin citar
  - Aportar valor agregado
  - Contextualizar para Latinoamérica cuando sea posible

## 🌍 Consideraciones Regionales

### Para Contenido Regional
- Incluir contexto local (clima, geografía, cultura)
- Mencionar autoridades reguladoras locales
- Usar terminología local además de estándar
- Incluir factores económicos regionales

### Equivalencias de Términos
| Español (México) | Español (España) | Inglés |
|-----------------|------------------|---------|
| Toma domiciliaria | Acometida | Service connection |
| Válvula de globo | Válvula de asiento | Globe valve |
| Pipa | Camión cisterna | Water truck |

## 📝 Plantilla de Contenido

```markdown
# [Título del Documento]

**Categoría**: [hydraulics|regulations|best-practices]
**Subcategoría**: [específica]
**Región**: [país o global]
**Fecha**: YYYY-MM-DD
**Versión**: X.Y

## Resumen
[200-300 palabras describiendo el contenido principal]

## Palabras Clave
- palabra1
- palabra2
- palabra3
- [máximo 10]

## Contenido

### [Sección 1]
[Contenido...]

### [Sección 2]
[Contenido...]

## Ejemplos Prácticos
[Al menos un ejemplo aplicado]

## Casos de Uso
[Situaciones donde aplica este conocimiento]

## Referencias
1. [Referencia 1]
2. [Referencia 2]
[etc.]

## Historial de Cambios
- v1.0 (YYYY-MM-DD): Versión inicial
```

## 🚀 Proceso de Contribución

1. **Investigación**
   - Recopila información de múltiples fuentes
   - Verifica la vigencia de normativas
   - Confirma la aplicabilidad práctica

2. **Redacción**
   - Usa la plantilla proporcionada
   - Escribe en tercera persona
   - Mantén un tono profesional pero accesible

3. **Validación**
   - Revisa cálculos y ejemplos
   - Verifica enlaces y referencias
   - Solicita revisión de pares si es posible

4. **Envío**
   - Crea un PR con título descriptivo
   - Incluye resumen de cambios
   - Responde a comentarios de revisión

## 🏆 Criterios de Excelencia

El contenido excepcional incluye:
- **Visualizaciones**: Diagramas, gráficos, tablas comparativas
- **Herramientas**: Calculadoras, hojas de cálculo, scripts
- **Casos Reales**: Con datos y resultados verificables
- **Actualizaciones**: Compromiso de mantener el contenido actualizado

## ❓ FAQ para Contribuyentes

**P: ¿Puedo contribuir si no soy ingeniero hidráulico?**
R: Sí, especialmente en áreas como normativas, traducción, o recopilación de casos de éxito.

**P: ¿En qué idioma debo escribir?**
R: Preferentemente español, pero aceptamos inglés y portugués. Indica si puedes traducir.

**P: ¿Cuánto detalle técnico incluir?**
R: Suficiente para ser útil a un ingeniero junior, con referencias para profundizar.

**P: ¿Cómo manejo información conflictiva entre países?**
R: Documenta las diferencias explícitamente, indicando el contexto de cada una.

## 📞 Soporte

- **Discord**: #content-help
- **Email**: content@boorie.org
- **Office Hours**: Jueves 15:00-17:00 UTC

---

¡Gracias por contribuir a democratizar el conocimiento hidráulico! 💧