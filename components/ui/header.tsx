// src/components/header.tsx
import Image from "next/image"
import Link from "next/link"

export function Header() {
  return (
    <header className="border-b border-zinc-800/20">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-6 py-4">
        <Link href="/">
          <Image
            src="/logo.png"
            alt="CareerCompass"
            width={140}
            height={35}
            priority
          />
        </Link>
      </div>
    </header>
  )
}
