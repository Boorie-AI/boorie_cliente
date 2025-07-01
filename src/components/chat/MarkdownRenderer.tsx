import React from 'react'
import { cn } from '@/utils/cn'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const parseInlineMarkdown = (text: string): React.ReactNode[] => {
    const elements: React.ReactNode[] = []
    let currentIndex = 0
    let elementKey = 0

    while (currentIndex < text.length) {
      let matched = false

      // Inline code (`code`)
      const inlineCodeMatch = text.slice(currentIndex).match(/^`([^`\n]+)`/)
      if (inlineCodeMatch) {
        elements.push(
          <code key={elementKey++} className="bg-accent/50 px-1.5 py-0.5 rounded text-sm font-mono border">
            {inlineCodeMatch[1]}
          </code>
        )
        currentIndex += inlineCodeMatch[0].length
        matched = true
      }

      // Bold (**text** or __text__)
      if (!matched) {
        const boldMatch = text.slice(currentIndex).match(/^(\*\*|__)((?:(?!\1).)+)\1/)
        if (boldMatch) {
          elements.push(
            <strong key={elementKey++} className="font-bold">
              {boldMatch[2]}
            </strong>
          )
          currentIndex += boldMatch[0].length
          matched = true
        }
      }

      // Italic (*text* or _text_)
      if (!matched) {
        const italicMatch = text.slice(currentIndex).match(/^(\*|_)((?:(?!\1).)+)\1/)
        if (italicMatch) {
          elements.push(
            <em key={elementKey++} className="italic">
              {italicMatch[2]}
            </em>
          )
          currentIndex += italicMatch[0].length
          matched = true
        }
      }

      // Strikethrough (~~text~~)
      if (!matched) {
        const strikeMatch = text.slice(currentIndex).match(/^~~(.*?)~~/)
        if (strikeMatch) {
          elements.push(
            <del key={elementKey++} className="line-through opacity-75">
              {strikeMatch[1]}
            </del>
          )
          currentIndex += strikeMatch[0].length
          matched = true
        }
      }

      // Links ([text](url))
      if (!matched) {
        const linkMatch = text.slice(currentIndex).match(/^\[([^\]]+)\]\(([^)]+)\)/)
        if (linkMatch) {
          elements.push(
            <a
              key={elementKey++}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary/80 transition-colors"
            >
              {linkMatch[1]}
            </a>
          )
          currentIndex += linkMatch[0].length
          matched = true
        }
      }

      // If no markdown found, add the current character
      if (!matched) {
        const nextSpecialIndex = text.slice(currentIndex + 1).search(/[*_`~\[\]]/)
        const endIndex = nextSpecialIndex === -1 ? text.length : currentIndex + 1 + nextSpecialIndex
        const textSegment = text.slice(currentIndex, endIndex)
        if (textSegment) {
          elements.push(<span key={elementKey++}>{textSegment}</span>)
        }
        currentIndex = endIndex
      }
    }

    return elements
  }

  const renderContent = () => {
    // Handle code blocks first
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match
    let elementKey = 0

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add content before code block
      if (match.index > lastIndex) {
        const beforeContent = content.slice(lastIndex, match.index)
        parts.push(...renderRegularContent(beforeContent, elementKey))
        elementKey += 100 // Increment to avoid key conflicts
      }

      // Add code block
      const language = match[1] || ''
      const code = match[2].trim()
      parts.push(
        <pre key={elementKey++} className="bg-card border border-border rounded-lg p-4 my-3 overflow-x-auto">
          <code className="text-sm font-mono text-foreground whitespace-pre">
            {code}
          </code>
        </pre>
      )

      lastIndex = match.index + match[0].length
    }

    // Add remaining content
    if (lastIndex < content.length) {
      const remainingContent = content.slice(lastIndex)
      parts.push(...renderRegularContent(remainingContent, elementKey))
    }

    return parts
  }

  const renderRegularContent = (text: string, startKey: number) => {
    const lines = text.split('\n')
    const renderedLines: React.ReactNode[] = []

    lines.forEach((line, lineIndex) => {
      const key = startKey + lineIndex

      // Blockquotes (> text)
      if (line.trim().startsWith('> ')) {
        renderedLines.push(
          <blockquote key={key} className="border-l-4 border-muted pl-4 my-2 italic opacity-80">
            {parseInlineMarkdown(line.slice(2))}
          </blockquote>
        )
        return
      }

      // Unordered lists (- item)
      if (line.trim().match(/^[-*+]\s/)) {
        renderedLines.push(
          <div key={key} className="flex items-start my-1">
            <span className="mr-2 mt-0.5">•</span>
            <span>{parseInlineMarkdown(line.replace(/^[-*+]\s/, ''))}</span>
          </div>
        )
        return
      }

      // Ordered lists (1. item)
      if (line.trim().match(/^\d+\.\s/)) {
        const numberMatch = line.trim().match(/^(\d+)\.\s/)
        renderedLines.push(
          <div key={key} className="flex items-start my-1">
            <span className="mr-2 mt-0.5 min-w-[1rem]">{numberMatch?.[1]}.</span>
            <span>{parseInlineMarkdown(line.replace(/^\d+\.\s/, ''))}</span>
          </div>
        )
        return
      }

      // Headers (# text)
      const headerMatch = line.match(/^(#{1,6})\s(.+)/)
      if (headerMatch) {
        const level = headerMatch[1].length
        const HeaderTag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements
        const headerClasses = {
          1: "text-xl font-bold mt-4 mb-2",
          2: "text-lg font-bold mt-3 mb-2", 
          3: "text-base font-bold mt-2 mb-1",
          4: "text-base font-semibold mt-2 mb-1",
          5: "text-sm font-semibold mt-1 mb-1",
          6: "text-sm font-medium mt-1 mb-1"
        }
        
        renderedLines.push(
          React.createElement(
            HeaderTag,
            { key, className: headerClasses[level as keyof typeof headerClasses] },
            parseInlineMarkdown(headerMatch[2])
          )
        )
        return
      }

      // Regular line
      if (line.trim()) {
        renderedLines.push(
          <div key={key}>{parseInlineMarkdown(line)}</div>
        )
      } else {
        // Empty line for spacing
        renderedLines.push(<br key={key} />)
      }
    })

    return renderedLines
  }

  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {renderContent()}
    </div>
  )
}