import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy & Terms of Service | TallyPadi',
  description: 'Read our Privacy Policy and Terms of Service. We are committed to protecting your data and ensuring secure business operations.',
  alternates: {
    canonical: 'https://tallypadi.com/policy',
  },
  openGraph: {
    title: 'Privacy Policy & Terms of Service',
    description: 'Data protection, privacy rights, and terms of use for TallyPadi.',
    url: 'https://tallypadi.com/policy',
  },
};

export default function PolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-600">
      {/* Header */}
      <nav className="bg-white shadow-sm w-full z-50 sticky top-0 border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition group">
              <div className="bg-green-100 p-2 rounded-full group-hover:bg-green-200 transition">
                <ArrowLeft className="text-green-600" size={20} />
              </div>
              <span className="font-heading font-bold text-lg tracking-tight text-slate-900">Back to Tallypadi</span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Navigation Tabs */}
        <div className="flex space-x-6 mb-10 border-b border-slate-200">
          <a href="#privacy" className="pb-3 border-b-2 border-green-600 text-green-700 font-bold text-lg">Privacy Policy</a>
          <a href="#terms" className="pb-3 border-b-2 border-transparent text-slate-500 hover:text-slate-700 font-medium text-lg transition">Terms of Service</a>
        </div>

        {/* Privacy Policy Section */}
        <section id="privacy" className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-slate-100 mb-12 scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-1 bg-green-500 rounded-full"></div>
            <h1 className="text-3xl font-heading font-bold text-slate-900">Privacy Policy</h1>
          </div>
          <p className="text-sm text-slate-400 font-medium mb-8 bg-slate-50 inline-block px-3 py-1 rounded-full">Last Updated: October 26, 2025</p>

          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">1. Introduction</h2>
              <p className="leading-relaxed text-slate-600">
                Tallypadi ("we," "our," or "us") respects the privacy of our users ("you"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our WhatsApp Chatbot service. We are committed to complying with the <strong>Nigeria Data Protection Regulation (NDPR)</strong>.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">2. Information We Collect</h2>
              <ul className="list-disc pl-5 space-y-2 marker:text-green-500">
                <li><strong>Personal Data:</strong> Your WhatsApp phone number and profile name, which are automatically visible when you interact with our bot.</li>
                <li><strong>Business Data:</strong> Information you voluntarily input, such as inventory items, sales records, expenses, and prices.</li>
                <li><strong>Usage Data:</strong> Timestamps of messages and interaction history to improve service reliability.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">3. How We Use Your Information</h2>
              <p className="leading-relaxed mb-2">We use the information we collect to:</p>
              <ul className="list-disc pl-5 space-y-2 marker:text-green-500">
                <li>Generate your daily profit and sales reports.</li>
                <li>Maintain your digital inventory ledger.</li>
                <li>Send you automated alerts (e.g., low stock warnings).</li>
                <li>Comply with legal obligations in Nigeria.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">4. Data Sharing and Disclosure</h2>
              <p className="leading-relaxed mb-2">We do not sell your personal data. We may share information with:</p>
              <ul className="list-disc pl-5 space-y-2 marker:text-green-500">
                <li><strong>Service Providers:</strong> Cloud hosting and database providers required to store your records securely.</li>
                <li><strong>Legal Authorities:</strong> If required by Nigerian law or to protect the rights of Tallypadi.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">5. Data Security</h2>
              <p className="leading-relaxed">
                We use administrative, technical, and physical security measures to help protect your personal information. However, please be aware that no transmission over the internet or WhatsApp is 100% secure.
              </p>
            </div>

            <div className="bg-green-50 p-6 rounded-xl border border-green-100">
              <h2 className="text-xl font-bold text-green-800 mb-3">6. Contact Us</h2>
              <p className="leading-relaxed text-green-700">
                If you have questions about this privacy policy, please contact us at:<br />
                <strong>Email:</strong> privacy@tallypadi.com<br />
                <strong>Address:</strong> Lagos, Nigeria.
              </p>
            </div>
          </div>
        </section>

        {/* Terms of Service Section */}
        <section id="terms" className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-slate-100 scroll-mt-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-1 bg-slate-900 rounded-full"></div>
            <h1 className="text-3xl font-heading font-bold text-slate-900">Terms of Service</h1>
          </div>
          <p className="text-sm text-slate-400 font-medium mb-8 bg-slate-50 inline-block px-3 py-1 rounded-full">Last Updated: October 26, 2025</p>

          <div className="space-y-8">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">1. Acceptance of Terms</h2>
              <p className="leading-relaxed text-slate-600">
                By accessing or using the Tallypadi WhatsApp Chatbot, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not use our service.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">2. Description of Service</h2>
              <p className="leading-relaxed text-slate-600">
                Tallypadi provides a digital bookkeeping tool via WhatsApp. We are not a financial institution, and our reports are for informational purposes based on the data you input. We are not responsible for financial errors resulting from incorrect data entry.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">3. User Responsibilities</h2>
              <p className="leading-relaxed mb-2">You agree not to use the service to:</p>
              <ul className="list-disc pl-5 space-y-2 marker:text-slate-900">
                <li>Record illegal transactions or illicit goods.</li>
                <li>Violate any local laws in Nigeria.</li>
                <li>Attempt to interfere with the proper working of the Chatbot.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">4. Limitation of Liability</h2>
              <p className="leading-relaxed text-slate-600">
                To the fullest extent permitted by applicable law, Tallypadi shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">5. Termination</h2>
              <p className="leading-relaxed text-slate-600">
                We reserve the right to terminate or suspend your access to our service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3">6. Governing Law</h2>
              <p className="leading-relaxed text-slate-600">
                These Terms shall be governed and construed in accordance with the laws of the Federal Republic of Nigeria, without regard to its conflict of law provisions.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="font-medium">&copy; 2025 Tallypadi. All rights reserved.</p>
          <div className="flex justify-center gap-4 mt-4 text-sm">
             <Link href="/" className="hover:text-white transition">Home</Link>
             <span>•</span>
             <Link href="/login" className="hover:text-white transition">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}