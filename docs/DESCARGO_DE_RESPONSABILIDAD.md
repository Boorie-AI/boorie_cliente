# Descargo de responsabilidad

Propuesta y proceso para incorporarlo a la aplicación. **Todavía no está implementado**: este
documento existe para decidir antes de escribir código, porque las decisiones que hay que tomar
son de producto y legales, no técnicas.

## El problema

Boorie produce cifras sobre las que alguien puede decidir dónde reforzar una red, cuánto
presupuestar una reparación o si un servicio aguanta un sismo. Y esas cifras salen de tres
sitios que fallan de formas distintas:

- **El motor de cálculo**, que es determinista pero parte de modelos con supuestos. La curva de
  fragilidad usa medianas por material publicadas, no calibradas contra la red concreta.
- **La simulación hidráulica**, que depende de que el `.inp` describa bien la red. Boorie no
  puede saber si el fichero miente.
- **La IA**, que puede equivocarse con seguridad aparente. Un usuario ya lo reportó en la
  encuesta del [#98](https://github.com/Boorie-AI/boorie_cliente/issues/98): «el chat al parecer
  puede producir respuestas inexactas si se usa más de un idioma».

Hoy hay avisos, pero **repartidos y sólo donde alguien se acordó de ponerlos**:

| Dónde | Qué dice |
|---|---|
| Curva de fragilidad | «requiere validación de un experto APyS antes de usarse en decisiones reales» |
| Componentes de la curva | «Coeficientes aportados por el usuario, no publicados por Boorie» |
| Visor, red sin georreferenciar | «Ojo: las coordenadas de esta red son unidades de dibujo, no una proyección» |
| Chat, calculadora, simulación, informes | **nada** |

El resultado es desigual: la pantalla más honesta de la aplicación es la de fragilidad, y no
porque su cifra sea peor, sino porque se construyó hablando con un experto que insistió en
declarar la incertidumbre. Donde no hubo esa conversación, no hay aviso.

## Lo que se propone

Tres capas, porque un solo aviso no cubre los tres momentos en que hace falta.

### 1. Aceptación al primer arranque

Un diálogo, **una sola vez**, que hay que aceptar para seguir. Es lo que deja constancia de que
quien usa Boorie sabe qué tiene entre manos.

- No se puede cerrar con la X ni con Escape: la única salida es aceptar, o cerrar la aplicación.
- Se guarda **qué versión del texto** se aceptó y **cuándo**. Si el texto cambia de forma
  sustancial, vuelve a pedirse; si sólo se corrige una errata, no.
- No se pide otra vez en cada actualización de la aplicación: eso lo convierte en un trámite
  que nadie lee.

### 2. Aviso permanente donde se produce una cifra

Una línea discreta al pie de cada resultado, con el mismo tono que ya usa la curva de
fragilidad. No es un modal: es una nota que está siempre y no interrumpe.

Alcance propuesto, por orden de urgencia:

1. **Respuestas de la IA** en el chat, general y de proyecto. Es lo único que puede inventarse
   una cifra entera.
2. **Resultados de simulación** y de escenarios de interrupción.
3. **Calculadora**, en el resultado.
4. **Informes exportados** (CSV y cualquier PDF futuro): el aviso tiene que viajar **dentro del
   fichero**, porque el fichero se reenvía sin la aplicación alrededor.

### 3. Texto completo en «Acerca de»

La pestaña ya existe y ya lee el `CHANGELOG.md`. Se le añade una sección con el texto íntegro,
para poder consultarlo sin depender de haberlo leído el primer día.

## Un borrador del texto, que hay que revisar

**Esto es un borrador de ingeniería, no un texto legal revisado.** Lo redacto para que se pueda
discutir sobre algo concreto, pero antes de publicarlo tiene que pasar por quien asuma la
responsabilidad del producto. Boorie se usa sobre infraestructura de agua potable, y un descargo
mal redactado es peor que ninguno: da una sensación de cobertura que no existe.

> **Boorie es una herramienta de apoyo a la decisión, no un sustituto del criterio profesional.**
>
> Los resultados de cálculo, simulación y análisis que produce Boorie parten de modelos con
> supuestos y de los datos que usted aporta. Su validez depende de que la red esté bien descrita
> y de que el modelo sea aplicable al caso. Boorie no puede comprobar ninguna de las dos cosas.
>
> Las respuestas generadas por inteligencia artificial pueden ser inexactas o estar incompletas,
> incluso cuando parecen seguras. Contrástelas antes de actuar sobre ellas.
>
> **Ninguna decisión sobre infraestructura real debería tomarse a partir de una cifra de Boorie
> sin la validación de un profesional cualificado**, y cuando la normativa lo exija, de un
> profesional habilitado para firmar el proyecto.
>
> Usted es responsable del uso que haga de los resultados y del cumplimiento de la normativa que
> le aplique.

Va en los tres idiomas, y la traducción de un texto legal **no es un ejercicio de idioma**:
conviene que la revise alguien de cada jurisdicción, o declarar cuál es la versión que prevalece.

## Decisiones que hay que tomar antes de escribir código

| | Opciones | Recomendación |
|---|---|---|
| ¿Bloquea el primer arranque? | Diálogo obligatorio · aviso no bloqueante | **Bloqueante.** Sin aceptación registrada no hay constancia, y la constancia es medio motivo de esto |
| ¿Dónde se guarda la aceptación? | `preferencesStore` (localStorage) · base de datos | **Base de datos.** localStorage se borra al limpiar datos del usuario y la aceptación volvería a pedirse; además la base ya viaja con el perfil |
| ¿Reaparece al cambiar el texto? | Siempre · sólo en cambios sustanciales | **Sólo sustanciales**, con un número de versión del texto que se sube a mano |
| ¿Alcance de los avisos permanentes? | Sólo IA · IA y simulación · todo resultado | **IA y simulación** en la primera tanda; la calculadora después |
| ¿En los ficheros exportados? | Sí · no | **Sí.** Un CSV se reenvía por correo sin la aplicación alrededor |
| ¿Prevalece un idioma? | Sí · los tres por igual | Hay que decidirlo **con quien revise el texto**, no aquí |

## Cómo se añade a la aplicación

Cuando las decisiones estén tomadas, el trabajo es éste. Está ordenado para que cada paso se
pueda verificar por separado.

### 1. El texto, en los tres ficheros de idioma

Namespace propio, `descargo`, con el texto partido en párrafos —no una cadena gigante— para que
se pueda maquetar y traducir por partes:

```
descargo.titulo, descargo.parrafoModelos, descargo.parrafoIA,
descargo.parrafoDecision, descargo.parrafoResponsabilidad,
descargo.aceptar, descargo.avisoCorto
```

`descargo.avisoCorto` es la línea de la capa 2, y tiene que caber en un pie de tarjeta.

La comprobación de idiomas que ya existe obliga a que las claves cuadren en los tres ficheros,
así que no se puede olvidar el catalán.

### 2. La versión del texto

Una constante, no un número suelto por ahí:

```ts
// Subir sólo cuando el texto cambie de forma sustancial. Corregir una errata
// no debe volver a pedir la aceptación a todo el mundo.
export const VERSION_DESCARGO = 1
```

### 3. Guardar la aceptación

Modelo nuevo en `prisma/schema.prisma` —o un campo en el de preferencias, si se prefiere— con
la versión aceptada y la fecha. Handler IPC para leer y escribir. Es lo que convierte «se mostró
un diálogo» en «hay constancia».

### 4. El diálogo

Componente nuevo, montado en `App.tsx` por encima del resto, que aparece cuando la versión
aceptada guardada es menor que `VERSION_DESCARGO`. Con Radix `Dialog`, cerrando las salidas:

```tsx
<Dialog.Root open modal>
  <Dialog.Content
    onEscapeKeyDown={e => e.preventDefault()}
    onPointerDownOutside={e => e.preventDefault()}
    onInteractOutside={e => e.preventDefault()}
  >
```

Sin `Dialog.Close`. La única salida es el botón de aceptar.

### 5. Los avisos permanentes

Un componente pequeño y reutilizable, al estilo del `AvisoDuracion` que ya existe en el visor,
para que el aviso se vea igual en todas partes y se cambie en un solo sitio.

### 6. En los ficheros exportados

Una línea de cabecera en el CSV. Ojo: las cabeceras de los CSV **hoy están escritas a fuego en
castellano** y el [#96](https://github.com/Boorie-AI/boorie_cliente/issues/96) no las cubría, así
que esto arrastra decidir en qué idioma se exporta.

### 7. La pestaña «Acerca de»

Sección nueva con el texto íntegro, debajo del historial de versiones.

### 8. Comprobaciones

- Que el diálogo aparece con la base limpia y **no** aparece cuando la versión aceptada es igual
  o mayor.
- Que subir `VERSION_DESCARGO` lo hace volver a aparecer.
- Que no se puede cerrar con Escape ni pinchando fuera: es la parte que un cambio de versión de
  Radix puede romper en silencio.
- Que la aceptación sobrevive a reiniciar la aplicación.
- En la aplicación real, en los tres idiomas: los tests no ven un diálogo que se sale de la
  pantalla ni un texto que se corta.

## Lo que esto no resuelve

Un descargo no arregla una cifra mala. Los avisos de la curva de fragilidad existen porque
**esas cifras necesitan validación**, y seguirán necesitándola con o sin diálogo al arrancar. La
capa 2 es la que de verdad protege a quien usa Boorie; la capa 1 protege sobre todo a quien lo
publica. Conviene no confundirlas al decidir el alcance.
