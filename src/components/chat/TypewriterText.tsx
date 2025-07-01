import { useState, useEffect, useRef } from 'react'

interface TypewriterTextProps {
  text: string
  speed?: number
  onComplete?: () => void
}

export function TypewriterText({ text, speed = 30, onComplete }: TypewriterTextProps) {
  const [displayText, setDisplayText] = useState('')
  const lastTextLength = useRef(0)

  useEffect(() => {
    // Si el texto nuevo es más largo que el anterior, solo añadimos los caracteres nuevos
    if (text.length > lastTextLength.current) {
      const newChars = text.slice(lastTextLength.current)
      
      // Añadir los nuevos caracteres uno por uno con delay
      let charIndex = 0
      const addChars = () => {
        if (charIndex < newChars.length) {
          setDisplayText(prev => prev + newChars[charIndex])
          charIndex++
          setTimeout(addChars, speed)
        } else if (onComplete && text.length === displayText.length + newChars.length) {
          onComplete()
        }
      }
      
      setTimeout(addChars, speed)
      lastTextLength.current = text.length
    }
    // Si el texto es completamente nuevo (más corto), resetear
    else if (text.length < lastTextLength.current) {
      setDisplayText('')
      lastTextLength.current = 0
    }
  }, [text, speed, onComplete])

  return (
    <span>
      {displayText}
      <span className="animate-pulse text-primary">▌</span>
    </span>
  )
}