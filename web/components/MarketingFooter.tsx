import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Mail, MapPin, MessageCircle } from "lucide-react";

const footerColumns = [
  {
    title: "PRODUCT",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#how-it-works", label: "How it Works" },
      { href: "/marketplace", label: "Marketplace" },
      { href: "/free-invoice-generator", label: "Free Invoice" },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { href: "/about", label: "About TallyPadi" },
      { href: "/contact", label: "Contact" },
      { href: "/partners", label: "Partnership" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    title: "RESOURCES",
    links: [
      { href: "/help", label: "Help Center" },
      { href: "/faq", label: "FAQs" },
      { href: "/whatsapp-receipt-generator", label: "WhatsApp Receipts" },
      { href: "/inventory-stock-management", label: "Inventory Guide" },
    ],
  },
  {
    title: "LEGAL",
    links: [
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/terms-of-service", label: "Terms and Services" },
      { href: "/policy", label: "Store Policy" },
    ],
  },
];

const companyFacts = [
  { label: "Business name", value: "TallyPadi" },
  { label: "Service location", value: "Lagos, Nigeria" },
  { label: "Support email", value: "support@tallypadi.com" },
  { label: "Privacy email", value: "privacy@tallypadi.com" },
  { label: "WhatsApp support", value: "+234 903 566 4420" },

];

const handStyle = {
  fontFamily: '"Comic Sans MS", "Marker Felt", "Trebuchet MS", cursive',
} satisfies React.CSSProperties;

export default function MarketingFooter() {
  return (
    <footer className="bg-[#181816] text-stone-300">
      <div className="mx-auto grid max-w-[1480px] gap-10 px-5 py-12 sm:px-10 md:grid-cols-2 lg:grid-cols-[1.25fr_2.6fr_1fr_210px] lg:px-20">
        <div>
          <Link href="/" className="relative block h-11 w-[160px]" aria-label="TallyPadi home">
            <Image src="/tallypadi-logo.png" alt="TallyPadi logo" fill sizes="160px" className="object-contain brightness-0 invert" />
          </Link>
          <p className="mt-5 max-w-[260px] text-sm leading-6 text-stone-400">
            The complete shop on WhatsApp, web, and compatible POS machines. Built for all SMEs.
          </p>
          <dl className="mt-5 space-y-2 text-xs leading-5 text-stone-500">
            {companyFacts.map((fact) => (
              <div key={fact.label}>
                <dt className="inline font-black text-stone-300">{fact.label}: </dt>
                <dd className="inline">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="text-xs font-black text-white">{column.title}</h3>
              <ul className="mt-4 space-y-3 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="transition hover:text-emerald-300">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div>
          <h3 className="text-xs font-black text-white">CONTACT US</h3>
          <div className="mt-4 space-y-3 text-sm">
            <a href="mailto:support@tallypadi.com" className="flex items-center gap-2 transition hover:text-emerald-300">
              <Mail size={15} />
              support@tallypadi.com
            </a>
            <a
              href="https://wa.me/2349035664420?text=Hello%20TallyPadi%20support"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 transition hover:text-emerald-300"
            >
              <MessageCircle size={15} />
              +234 903 566 4420
            </a>
            <p className="flex items-center gap-2">
              <MapPin size={15} />
              Lagos, Nigeria
            </p>
          </div>
        </div>

        <div className="relative min-h-[120px] rounded-sm bg-[#f7f0df] p-5 text-stone-950 shadow-xl">
          <span className="absolute -top-3 left-7 h-7 w-20 rotate-[-8deg] bg-amber-100/90" />
          <p className="text-2xl font-black leading-8" style={handStyle}>
            We dey here
            <br />
            for you!
          </p>
          <div className="mt-3 h-10 w-10 rounded-full border-2 border-stone-900 text-center text-xl leading-9">⌣</div>
        </div>
      </div>

      <div className="mx-auto max-w-[1480px] border-t border-white/10 px-5 py-5 text-xs text-stone-500 sm:px-10 lg:px-20">
        © {new Date().getFullYear()} TallyPadi. All rights reserved.
      </div>
    </footer>
  );
}
