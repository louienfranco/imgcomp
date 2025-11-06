import Link from "next/link";
import { Globe, Twitter, Facebook } from "lucide-react";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full my-8">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="luwenprangko"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Twitter"
          >
            <Twitter className="h-5 w-5" />
            <span className="sr-only">Twitter</span>
          </Link>
          <Link
            href="https://www.facebook.com/luwenprangko"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Facebook"
          >
            <Facebook className="h-5 w-5" />
            <span className="sr-only">Facebook</span>
          </Link>
          <Link
            href="#"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Website"
          >
            <Globe className="h-5 w-5" />
            <span className="sr-only">Website</span>
          </Link>
        </div>

        <p className="text-sm text-muted-foreground">© {year} - louienfranco</p>
      </div>
    </footer>
  );
}
