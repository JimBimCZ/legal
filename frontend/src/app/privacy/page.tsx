import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Legal Document Creator",
  description: "What this app collects, who receives it, and how to have it erased.",
};

const LAST_UPDATED = "1 September 2026";

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="ui-eyebrow">{heading}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="type-display text-2xl text-heading">Privacy Policy</h1>
        <p className="ui-eyebrow mt-2">Last updated {LAST_UPDATED}</p>
      </div>

      <Section heading="Who is responsible">
        <p>
          This app is run by Vít Bušek, who is the data controller for everything described here.
          For any question about your data, or to exercise any of the rights below, write to{" "}
          <a
            href="mailto:busek.vit@gmail.com"
            className="ui-link underline decoration-line underline-offset-4"
          >
            busek.vit@gmail.com
          </a>
          .
        </p>
      </Section>

      <Section heading="What is collected">
        <p>
          <strong>Your account.</strong> When you sign in with GitHub, we store your GitHub numeric
          account id, your username, and your verified primary email address. We never receive your
          GitHub password, and we ask GitHub for no permission beyond reading your email address.
        </p>
        <p>
          <strong>Your documents.</strong> The values you enter while drafting are stored so you can
          come back to a document later. These routinely include details about other people and
          companies — counterparties, signatories, addresses — who have never used this app. Please
          enter only what the agreement genuinely needs.
        </p>
        <p>
          <strong>Your conversations.</strong> The full chat history for each document is stored
          alongside it, because that is what lets you resume a draft where you left off.
        </p>
      </Section>

      <Section heading="Who else sees it">
        <p>
          <strong>OpenRouter, and the AI provider it routes to.</strong> To draft your
          document, the messages you write and the document details they contain are sent to
          OpenRouter. OpenRouter does not run the AI model itself — it forwards the request to
          whichever provider is serving that model, normally Cerebras, and may route to a
          different provider if that one is unavailable. This means your contract details
          leave this app and are processed outside the EU, on infrastructure OpenRouter
          selects at the time of the request. If that is not acceptable for a particular
          agreement, do not enter it here.
        </p>
        <p>
          <strong>GitHub.</strong> Handles sign-in. GitHub learns that you use this app.
        </p>
        <p>
          <strong>Neon and Vercel.</strong> Neon hosts the database holding your account and
          documents. Vercel hosts the app itself and keeps ordinary server logs, which include IP
          addresses.
        </p>
        <p>Your data is not sold, and it is not used for advertising.</p>
      </Section>

      <Section heading="Why we are allowed to hold it">
        <p>
          All of the above is processed to provide the service you asked for — an account, and a
          document you can draft and come back to. In GDPR terms that is performance of a contract
          with you.
        </p>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Until you delete it. Your account and documents are kept for as long as the account
          exists, and are removed immediately when you delete it.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can ask for a copy of your data, ask for it in a portable form you can take elsewhere,
          have it corrected, have it erased, or object to how it is handled. Erasure is self-serve: the <strong>Delete account</strong> control on your
          documents page removes your account, every document, and every message, at once and
          permanently. For anything else, write to the address above.
        </p>
        <p>
          If you think your data is being mishandled, you can complain to the Czech data protection
          authority, the Úřad pro ochranu osobních údajů (uoou.gov.cz).
        </p>
      </Section>

      <Section heading="Cookies">
        <p>
          Two cookies, both strictly necessary: one that keeps you signed in, and a short-lived one
          used during sign-in to protect against request forgery. Your light or dark theme choice is
          remembered in your browser&apos;s local storage.
        </p>
        <p>
          That is everything. There are no analytics, no advertising or tracking cookies, and no
          third-party scripts of any kind. Because nothing here needs your consent under the
          ePrivacy rules, this site does not show a cookie banner.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If this policy changes materially, the date at the top changes with it. This is a small
          project; there is no mailing list to announce it on.
        </p>
      </Section>

      <p className="border-t border-line pt-6">
        <Link href="/" className="ui-link ui-eyebrow">
          ← Back to the app
        </Link>
      </p>
    </div>
  );
}
