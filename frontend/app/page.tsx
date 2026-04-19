import Image from 'next/image';
import Link from 'next/link';
import { Inter, Space_Grotesk } from 'next/font/google';
import logoImage from './logo.jpg';
import {
  ArrowRight,
  BrainCircuit,
  Globe,
  Lock,
  Package2,
  Search,
  ShieldCheck,
  ShoppingCart,
  Terminal,
} from 'lucide-react';
import { LaunchButton } from '@/components/landing/LaunchButton';
import { DiscoveryProcessLog } from '@/components/landing/DiscoveryProcessLog';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-stitch-body',
  weight: ['400', '500', '600', '700'],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-stitch-headline',
  weight: ['400', '500', '700'],
});

const architectureCards = [
  {
    Icon: Search,
    title: 'Natural-Language Search',
    description: 'Tell Mersi what you want in plain English and it turns the request into structured product discovery.',
    ref: '[CHAT_01]',
  },
  {
    Icon: BrainCircuit,
    title: 'Agent Recommendations',
    description: 'The assistant ranks picks with price, retailer, and imagery directly in chat so you can browse faster.',
    ref: '[RESULT_02]',
  },
  {
    Icon: ShoppingCart,
    title: 'Cart + Product Detail',
    description: 'Inspect product details, add items to cart, and jump back into discovery without losing context.',
    ref: '[CART_03]',
  },
  {
    Icon: ShieldCheck,
    title: 'Checkout + Orders',
    description: 'Buy from the cart with Crossmint-backed approval, then track payment and delivery status in the orders panel.',
    ref: '[ORDER_04]',
  },
];

const intentLog = [
  {
    time: '09:41:18',
    label: 'LOAD_QUERY',
    tone: 'text-[var(--landing-primary)]',
    message: 'LOAD query "minimalist watch" --budget 250 --currency USD',
  },
  {
    time: '09:41:19',
    label: 'PARSE_INTENT',
    tone: 'text-[var(--landing-tertiary)]',
    message: 'PARSE intent --extract category budget style constraints',
  },
  {
    time: '09:41:20',
    label: 'MARKET_SCAN',
    tone: 'text-[var(--landing-primary)]',
    message: 'SCAN marketplaces --sync inventory retailer_metadata',
  },
  {
    time: '09:41:21',
    label: 'RANK_MATCHES',
    tone: 'text-[var(--landing-tertiary)]',
    message: 'RANK matches --sort relevance price imagery availability',
  },
  {
    time: '09:41:22',
    label: 'ENABLE_ACTIONS',
    tone: 'text-[var(--landing-primary)]',
    message: 'ENABLE actions --detail --cart --checkout',
  },
];

const cartStats = [
  {
    label: 'Marketplace_Data',
    value: 'Live',
    suffix: 'attached',
    width: 'w-[90%]',
    accent: 'bg-[var(--landing-primary)]',
  },
  {
    label: 'Detail_Sheet',
    value: 'Inline',
    suffix: 'preview',
    width: 'w-4/5',
    accent: 'bg-[var(--landing-tertiary)]',
  },
  {
    label: 'Cart_Status',
    value: 'Ready',
    suffix: 'to buy',
    width: 'w-4/5',
    accent: 'bg-[var(--landing-primary)]',
  },
];

const cartSteps = [
  {
    title: 'Open_Detail_Sheet',
    detail: 'VIEW_IMAGES • PRICE • RETAILER',
    tone: 'bg-[var(--landing-tertiary)]',
  },
  {
    title: 'Add_To_Cart',
    detail: 'SYNC_LOCAL_AND_BACKEND_CART',
    tone: 'bg-[var(--landing-primary)]',
  },
  {
    title: 'Review_Subtotal',
    detail: 'BUY_FROM_CART_SIDEBAR',
    tone: 'bg-[var(--landing-primary)]',
  },
];

const checkoutManifest = [
  { label: 'Login_Methods', value: 'Email + Google', tone: 'text-white' },
  { label: 'Wallet_Signer', value: 'Crossmint', tone: 'text-[var(--landing-tertiary)]' },
  { label: 'Order_Polling', value: 'Active', tone: 'text-white' },
];

const curatedCards = [
  {
    badge: 'Marketplace Match',
    title: 'Minimalist Watch',
    subtitle: 'Returned in chat with price, image, and retailer context for quick comparison.',
    price: '$249.00',
    action: '[ View_Details ]',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDzqNSVS6nhPnO8229_ESHOtKr8u8y9Mca_i5yhaKKAQg86mY91P-0wMblq5rzlx8jlDqlNv4Ir3eOEzuAp3m2hpE9Yc_HufeumvtSZv7jLwNse5h_7Uf3q8gxv052r--FEQRa4Uy36UFjScg6KhCRbilFD1np3W2WgJHNjdOabtqYiDWRZu1-Yn8dy6nSp-tmfCKBV5jBaq-hP-k75803YZYlg52-qZSCQJqrkLBOzHfLev1CTcMEntXOqeXuwBISoZ0KvlO-53g',
    featured: false,
  },
  {
    badge: 'Top Pick',
    title: 'Skeleton Watch',
    subtitle: 'A ranked recommendation the assistant can send straight to the detail sheet or cart.',
    price: '$895.00',
    action: '[ Add_To_Cart ]',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAqKRA36NAWVN8vfkifhktW3aoqCARD-nAl5MvMZP7CD2lGdHL_R_Fowh9Zcp802JheHWnZxklSxQs9Xn2XvMgd2aNtQ_y-zCf28llAbCd6wBKIzI4lWdqnWfiaEj3WyS7ClWQOfmsWJekQJeoWTBMSj2iSDwDnKVSzaIPfvLx5aNcYqSHI63-oWfyD1pP7tdewRingodkEDOHoUiXMbzaBwUYqhWCP81JVYRbx1nIhYmQYhq4xZoetcFB9fxZ9SkNFKvt0YNZoGg',
    featured: true,
  },
  {
    badge: 'Saved Search',
    title: 'Dress Watch',
    subtitle: 'The kind of result Mersi can surface when you narrow by style, budget, or occasion.',
    price: '$540.00',
    action: '[ View_Details ]',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAqWPVAfqhG3O8c1OQd9k37Tcy7JatsTjRHnHCx1pMNq59cRINx_3-RfpFQyRR1MfZZhNz3SR-855EzU-pagEoczCka2QVgyxBWKqg1O-jpCD7c3uSFEEVZ_p73Oe7GCHetckrWlo1gKVu61-yo91R9mEyPXR0YYvHwML3xHcdCGr3-oq9vzvlXA1e6zs03tLHJfmLXw7yM4jG_mNPvjwUzd9wg1uncod-QCtGR0Frzya9epJ6tLbvaMfSbk82v0wKW_aBzS8ROBw',
    featured: false,
  },
];

const orderCards = [
  {
    title: 'Payment Confirmed',
    subtitle: 'After approval, the order moves into a confirmed state and stays visible in history.',
    status: 'payment_confirmed',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBglBDfM3jILsD4FFGy0upfkF6Xsx59_7KM1STigUvS-laC-ilH4iEAMYuWy57wEFF0HPRzVkPNmm5zGUAOI4arTT2ZsZH9cS6RFIXTcTpnfsMJZKyMAexUYl39J3YEQtQL3XAPtm2yWiiSU3nPKVZ_yKb9sydKZ5Azz0-HziGnfVYwE3cTAq-dOe17is15t0AIMQA9SrkMpuw9VJw5ZpNENPcSrt7FxHcfwVzl2ZddW9CUP2lb8VZdYujqXsCpKiZMJM0KkCZtPw',
  },
  {
    title: 'In Progress',
    subtitle: 'Mersi keeps polling while the merchant processes the purchase and updates delivery state.',
    status: 'in_progress',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBAFsMrk5tXYNEEKptDjqMhgpeUeptaWbaTnHZnInKK3Y2oE2z_-7-ezTMHtJLKWLEAcYUTG5DX5QmR5UBDj2awFXXJFHz-xAl6Iz3Osomu7eh2Sk-JMjDJo3SjNpF4wc5nPYxHHzy-xhKMizBIfvrKSEOO4PHTuqGrKBWtx9GXHskkFn4Ri2LK3dj-cKZgFkNxaTokDx912pHi1bwJ3CK07rcjzJb-Nea834JqAz3fVS1ymRzR_uMyXYfTT3uyxwfFybdQu4Ewfw',
  },
  {
    title: 'Delivered',
    subtitle: 'Finished orders remain filterable by type, phase, status, and date in the orders sidebar.',
    status: 'delivered',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC5WHuDNtoic0-w0JEzf46PLfmzppbNk8fPMk9cigoH1nySdwDIiT6uqb9yhDUd4eBfw45lR72CLGfB_olXLiv3F5pku2J6-XL3q9Y5qE68jSuY4EB17aYSJUAemSxLpTqc3lg_A5yKL1j_QUby1iNY6eOXUDTiltSz5BblXWR78hqinhLscRRhe5DgGp3_KJMZVFYmHYg-JlfbJS1xULse8AjXkbOauSrXSYjZEJFJlK_Hp1SAj74XP6H8CghLQZoSFBW9AUumYA',
  },
];

function GridRails() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden md:grid grid-cols-12 gap-6 opacity-20">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="border-l border-[var(--landing-outline)]/60" />
      ))}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  accent,
  description,
  refCode,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  description?: string;
  refCode?: string;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="border-l-4 border-[var(--landing-primary)] pl-5 md:pl-6">
        <p className="stitch-label text-[10px] text-[var(--landing-tertiary)]">{eyebrow}</p>
        <h2 className="stitch-headline mt-2 text-4xl leading-[0.92] text-white md:text-6xl lg:text-7xl">
          {title}
          {accent ? (
            <>
              <br />
              <span className="text-[var(--landing-primary)]">{accent}</span>
            </>
          ) : null}
        </h2>
        {description ? (
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--landing-muted)] md:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {refCode ? <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">{refCode}</p> : null}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className={`${inter.variable} ${spaceGrotesk.variable} stitch-landing`}>
      <nav className="stitch-nav-backdrop sticky top-0 z-50 border-b border-[var(--landing-outline)]/20">
        <div className="stitch-shell flex h-20 items-center justify-between gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image
              src={logoImage}
              alt="Mersi"
              width={36}
              height={36}
              className="h-9 w-9 rounded-none object-cover"
            />
            <span className="stitch-headline text-xl font-bold tracking-[0.24em] text-white">Mersi</span>
          </div>

          <div className="hidden items-center gap-10 border-x border-[var(--landing-outline)]/20 px-8 md:flex">
            <Link className="stitch-label text-xs text-[var(--landing-primary)]" href="#protocol">
              Features
            </Link>
            <Link
              className="stitch-label text-xs text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-tertiary)]"
              href="#intent"
            >
              Chat
            </Link>
            <Link
              className="stitch-label text-xs text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-tertiary)]"
              href="#settlement"
            >
              Checkout
            </Link>
            <Link
              className="stitch-label text-xs text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-tertiary)]"
              href="#acquisition"
            >
              Orders
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="#recommendations"
              className="stitch-label hidden text-xs text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-tertiary)] md:inline-flex"
            >
              Results
            </Link>
            <LaunchButton className="stitch-primary-button stitch-label inline-flex items-center gap-2 px-4 py-3 text-[11px] sm:px-6">
              Open App
            </LaunchButton>
          </div>
        </div>
      </nav>

      <main className="overflow-hidden">
        <section className="relative min-h-[860px] overflow-hidden px-4 py-20 sm:px-6 md:py-28" id="hero">
          <GridRails />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(0,0,255,0.25),transparent_32%),radial-gradient(circle_at_82%_14%,rgba(157,255,32,0.08),transparent_20%),linear-gradient(180deg,rgba(19,19,19,0.8),#131313)]" />
          <div className="pointer-events-none absolute inset-0 stitch-grid opacity-30" />

          <div className="stitch-shell relative z-10 grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_420px] lg:items-center">
            <div className="max-w-3xl">
              <div className="mb-6 flex items-center gap-4">
                <span className="stitch-label text-[11px] text-[var(--landing-tertiary)]">[SHOPPING_AGENT]</span>
                <div className="h-px w-16 bg-[var(--landing-tertiary)]" />
              </div>

              <h1 className="stitch-headline text-5xl font-black leading-[0.88] text-white sm:text-6xl md:text-7xl lg:text-[5.45rem]">
                Shopping Agent
                <br />
                <span className="bg-gradient-to-r from-white via-[var(--landing-primary)] to-[var(--landing-primary)] bg-clip-text text-transparent">
                  From Chat to Checkout.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--landing-muted)] md:text-lg">
                Describe what you want in plain English and Mersi returns marketplace matches, lets you inspect
                details, add items to cart, approve checkout through Crossmint, and track every order.
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <LaunchButton className="stitch-primary-button stitch-label inline-flex items-center justify-between gap-4 px-7 py-5 text-xs">
                  Start Shopping
                  <ArrowRight className="h-4 w-4" />
                </LaunchButton>
                <Link
                  href="#protocol"
                  className="stitch-secondary-button stitch-label inline-flex items-center justify-center gap-4 px-7 py-5 text-xs"
                >
                  View Workflow
                </Link>
              </div>
            </div>

            <div className="relative hidden min-h-[400px] items-center justify-center md:flex">
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[var(--landing-primary)]/20 to-transparent blur-3xl" />
              <div className="stitch-ghost-border relative flex h-[500px] w-full flex-col justify-between bg-[rgba(28,27,27,0.42)] p-6 backdrop-blur-[20px]">
                <div className="flex items-start justify-between text-[10px] uppercase tracking-[0.22em] text-[var(--landing-outline-bright)]">
                  <span>SESSION_072</span>
                  <span>CHAT_READY</span>
                </div>

                <div className="space-y-4">
                  <div className="flex h-12 items-center border border-[var(--landing-primary)]/50 bg-[var(--landing-primary)]/10 px-4">
                    <span className="h-2 w-2 animate-pulse bg-[var(--landing-tertiary)]" />
                    <span className="ml-4 stitch-label text-[10px] tracking-[0.18em] text-white">
                      MATCHING_MARKETPLACE_RESULTS...
                    </span>
                  </div>

                  <div className="relative flex h-32 items-center justify-center overflow-hidden border border-[var(--landing-outline)]/20 bg-black/35">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,255,0.15),transparent_60%)] opacity-50" />
                    <div className="relative flex h-full w-full flex-col justify-around p-3">
                      <div className="relative h-px w-full bg-gradient-to-r from-transparent via-[var(--landing-primary)]/50 to-transparent">
                        <span className="absolute -top-1 left-0 h-2 w-2 animate-pulse rounded-full bg-[var(--landing-tertiary)] blur-[1px]" />
                        <span className="absolute -top-1 right-0 h-2 w-2 animate-pulse rounded-full bg-[var(--landing-primary)] blur-[1px]" />
                      </div>

                      <div className="flex items-center justify-between px-4">
                        <div className="flex h-8 w-8 items-center justify-center border border-[var(--landing-outline)]/30">
                          <Globe className="h-4 w-4 text-[var(--landing-primary)]/40" />
                        </div>
                        <div className="mx-4 h-px flex-1 border-t border-dashed border-[var(--landing-outline)]/30" />
                        <div className="flex h-8 w-8 items-center justify-center border border-[var(--landing-outline)]/30">
                          <Package2 className="h-4 w-4 text-[var(--landing-primary)]/40" />
                        </div>
                      </div>

                      <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--landing-primary)]/50 to-transparent" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/6 pt-4">
                  <div>
                    <p className="stitch-label text-[9px] text-[var(--landing-outline-bright)]">Live Flow</p>
                    <p className="mt-2 stitch-headline text-lg font-bold text-white">Search to Checkout</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-[var(--landing-tertiary)]" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="protocol"
          className="bg-[var(--landing-surface-lowest)] px-4 py-20 sm:px-6 md:py-24"
        >
          <div className="stitch-shell">
            <div className="mb-14 flex flex-col gap-4 border-b border-[var(--landing-outline)]/20 pb-8 md:flex-row md:items-end md:justify-between">
              <h2 className="stitch-headline text-3xl font-bold text-white md:text-5xl">Core | Workflow</h2>
              <p className="stitch-label text-[10px] text-[var(--landing-tertiary)]">[FEATURE_SET]</p>
            </div>

            <div className="grid gap-px bg-[var(--landing-outline)]/20 md:grid-cols-2 xl:grid-cols-4">
              {architectureCards.map(({ Icon, title, description, ref }) => (
                <article
                  key={title}
                  className="stitch-hover-surface flex min-h-[290px] flex-col bg-[var(--landing-surface)] p-8"
                >
                  <div className="mb-8 flex h-12 w-12 items-center justify-center border border-[var(--landing-primary)]/30 text-[var(--landing-primary)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="stitch-headline text-xl font-bold text-white">{title}</h3>
                  <p className="mt-4 flex-1 text-sm leading-6 text-[var(--landing-muted)]">{description}</p>
                  <p className="stitch-label mt-8 border-t border-[var(--landing-outline)]/20 pt-4 text-[10px] text-[var(--landing-outline-bright)]">
                    {ref}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6 md:py-32" id="intent">
          <div className="stitch-shell">
            <SectionHeading
              eyebrow="[PHASE_01 // DISCOVERY]"
              title="Chat |"
              accent="Discovery"
              refCode="[REF: LIVE_QUERY_SESSION]"
            />

            <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_380px]">
              <article className="stitch-panel stitch-ghost-border relative overflow-hidden p-6 md:p-7">
                <div className="stitch-scanline absolute inset-0 opacity-15" />

                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 bg-[var(--landing-primary)]" />
                    <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">Live_Discovery.log</p>
                  </div>
                  <p className="stitch-label text-[9px] text-[var(--landing-outline-bright)]">SSE_STREAM=ACTIVE</p>
                </div>

                <DiscoveryProcessLog entries={intentLog} />
              </article>

              <div className="grid gap-8">
                <article className="stitch-hover-surface stitch-ghost-border bg-[var(--landing-surface-low)] p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">Conversation Ranking</p>
                      <p className="stitch-headline mt-3 text-4xl font-bold text-white">Results_Live</p>
                    </div>
                    <BrainCircuit className="h-10 w-10 text-[var(--landing-tertiary)]" />
                  </div>

                  <div className="mt-8 flex h-28 items-end gap-2 bg-black/35 px-3 pb-3">
                    {['h-8', 'h-10', 'h-14', 'h-20', 'h-16', 'h-12', 'h-[4.5rem]', 'h-24', 'h-16', 'h-12', 'h-20', 'h-10'].map(
                      (height, index) => (
                        <div
                          key={index}
                          className={`w-full ${height} ${index === 7 ? 'bg-[var(--landing-tertiary)]' : 'bg-[var(--landing-primary)]/60'}`}
                        />
                      ),
                    )}
                  </div>
                </article>

                <article className="stitch-ghost-border flex min-h-[220px] flex-col items-center justify-center bg-[var(--landing-surface-lowest)] p-6 text-center">
                  <div className="stitch-node-grid mb-5">
                    <div className="stitch-node-grid__ring" />
                    <div className="stitch-node-grid__ring stitch-node-grid__ring--inner" />
                    <div className="stitch-node-grid__core">
                      <Package2 className="h-7 w-7 text-[var(--landing-primary)]" />
                    </div>
                  </div>
                  <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">Marketplace_Result_Graph</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section
          id="audit"
          className="bg-[var(--landing-surface-lowest)] px-4 py-24 sm:px-6 md:py-32"
        >
          <div className="stitch-shell">
            <SectionHeading
              eyebrow="[PHASE_02 // REVIEW]"
              title="Cart |"
              accent="Review"
              refCode="CART_PANEL // DETAIL_SHEET_READY"
            />

            <div className="mt-14 grid gap-px bg-[var(--landing-outline)]/15 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
              <article className="bg-[var(--landing-surface)] p-8">
                <div className="space-y-8">
                  {cartStats.map((stat) => (
                    <div key={stat.label}>
                      <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">{stat.label}</p>
                      <div className="mt-2 flex items-end gap-2">
                        <span className="stitch-headline text-4xl font-bold text-white">{stat.value}</span>
                        {stat.suffix ? (
                          <span className="stitch-label text-[10px] text-[var(--landing-primary)]">{stat.suffix}</span>
                        ) : null}
                      </div>
                      <div className="mt-3 h-1 bg-[var(--landing-surface-high)]">
                        <div className={`h-full ${stat.width} ${stat.accent}`} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-10 bg-[var(--landing-surface-high)] p-4">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-4 w-4 text-[var(--landing-tertiary)]" />
                    <p className="stitch-label text-[9px] text-white">Cart_Sync</p>
                  </div>
                  <p className="mt-3 text-[10px] leading-5 text-[var(--landing-outline-bright)]">
                    Product selection, pricing, and retailer context stay available while you move from results into
                    checkout.
                  </p>
                </div>
              </article>

              <article className="relative min-h-[500px] overflow-hidden bg-black">
                <Image
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDatlTjwT3rXTd0ccdT4QvPER7oq8BoI7DKfQQNWEPJRt6UQ3zj9KfEXRDRSRzM40nD91PjmSTaRrNNZ5_MIYEqTMK4YJu91d55cQes3h09b_Uh7w50oS_Xea-WHgCSKqLCf1wubvxWL_LeXBG0P5Uh86ut6oS-xu0VI8HWN_bnT09L38DR9UoKkInbRuhC1Q4NboZNsTzSo_yPKC-o4Mb3AlVv1GNhKfzWKAiAqL9Ac3N2wdrW4TAEbqTbxaxnftgx0aZlvXGj6Q"
                  alt="Featured marketplace product"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover opacity-60 grayscale transition duration-1000 hover:grayscale-0"
                />
                <div className="absolute inset-0 bg-[var(--landing-primary)]/10" />
                <div className="absolute left-8 top-8 border border-white/10 bg-black/60 p-4 backdrop-blur-md">
                  <p className="stitch-label text-[9px] text-[var(--landing-primary)]">Detail_View: LIVE_204</p>
                  <p className="mt-2 stitch-headline text-lg font-bold text-white">Product Detail Preview</p>
                </div>
                <div className="absolute bottom-8 right-8 flex h-24 w-24 flex-col items-center justify-center bg-[var(--landing-tertiary)] text-black">
                  <ShieldCheck className="h-8 w-8" />
                  <span className="stitch-label mt-2 text-[8px] tracking-[0.16em]">Ready</span>
                </div>
              </article>

              <article className="bg-[var(--landing-surface)] p-8">
                <div className="mb-8 flex justify-between">
                  <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">Review_Flow</p>
                  <p className="stitch-label text-[10px] text-[var(--landing-tertiary)]">Live</p>
                </div>

                <div className="relative space-y-6">
                  <div className="absolute bottom-2 left-[3px] top-2 w-px bg-[var(--landing-outline)]/20" />
                  {cartSteps.map((step) => (
                    <div key={step.title} className="relative pl-6">
                      <div className={`absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full ${step.tone}`} />
                      <p className="stitch-label text-[10px] text-white">{step.title}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--landing-outline-bright)]">
                        {step.detail}
                      </p>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="stitch-label mt-12 w-full border border-[var(--landing-outline)] px-4 py-3 text-[10px] text-[var(--landing-outline-bright)] transition hover:bg-white hover:text-black"
                >
                  Open_Cart
                </button>
              </article>
            </div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6 md:py-32" id="settlement">
          <div className="stitch-shell">
            <SectionHeading
              eyebrow="[PHASE_03 // CHECKOUT]"
              title="Checkout |"
              accent="Approval"
              description="Start a purchase from the cart, let Mersi create the order, approve it through Crossmint email OTP, and the app keeps polling until the order is placed."
            />

            <div className="mt-14 grid gap-px bg-[var(--landing-outline)]/15 lg:grid-cols-[minmax(0,1fr)_360px]">
              <article className="relative overflow-hidden bg-[var(--landing-surface-lowest)] p-8 md:p-10">
                <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px]" />
                <div className="relative z-10 mx-auto max-w-md">
                  <div className="mb-10 flex items-end justify-between">
                    <div>
                      <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">Checkout_State</p>
                      <p className="stitch-headline mt-2 text-2xl font-bold text-[var(--landing-primary)]">CREATING_ORDER</p>
                    </div>
                    <div className="text-right">
                      <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">Approval_Method</p>
                      <p className="stitch-headline mt-2 text-2xl font-bold text-[var(--landing-tertiary)]">EMAIL_OTP</p>
                    </div>
                  </div>

                  <div className="flex justify-center py-8">
                    <div className="stitch-fingerprint-frame">
                      <div className="stitch-fingerprint-frame__ring stitch-fingerprint-frame__ring--outer" />
                      <div className="stitch-fingerprint-frame__ring stitch-fingerprint-frame__ring--mid" />
                      <div className="stitch-fingerprint-frame__core">
                        <Lock className="h-16 w-16 text-[var(--landing-primary)]" />
                        <div className="stitch-fingerprint-frame__scanline" />
                      </div>
                    </div>
                  </div>

                  <p className="stitch-label mt-10 text-center text-[10px] text-[var(--landing-outline-bright)]">
                    Waiting_For_Approval...
                  </p>
                </div>
              </article>

              <article className="flex flex-col justify-between bg-[var(--landing-surface-low)] p-8">
                <div>
                  <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">Checkout_Manifest</p>
                  <div className="mt-8 space-y-4">
                    {checkoutManifest.map((item, index) => (
                      <div
                        key={item.label}
                        className={
                          index === checkoutManifest.length - 1
                            ? 'flex items-center justify-between py-2'
                            : 'flex items-center justify-between border-b border-[var(--landing-outline)]/20 py-2'
                        }
                      >
                        <span className="text-xs text-[var(--landing-muted)]">{item.label}</span>
                        <span className={`stitch-headline text-sm font-bold ${item.tone}`}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-10 space-y-6">
                  <div className="stitch-ghost-border bg-black/35 p-4">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-4 w-4 text-[var(--landing-tertiary)]" />
                      <p className="stitch-label text-[10px] text-[var(--landing-tertiary)]">Inbox_Approval</p>
                    </div>
                    <p className="mt-3 text-[11px] leading-6 text-[var(--landing-outline-bright)]">
                      Checkout prompts the shopper to check email, enter the Crossmint OTP, and then Mersi continues
                      tracking the order until completion.
                    </p>
                  </div>

                  <LaunchButton className="stitch-primary-button stitch-headline inline-flex w-full items-center justify-between px-6 py-5 text-sm font-bold tracking-[0.2em]">
                    Start Checkout
                    <Lock className="h-4 w-4" />
                  </LaunchButton>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section
          className="bg-[var(--landing-surface)] px-4 py-24 sm:px-6"
          id="recommendations"
        >
          <div className="stitch-shell">
            <div className="mb-12 flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center bg-[var(--landing-primary)]">
                <Terminal className="h-4 w-4 text-white" />
              </div>
              <h2 className="stitch-headline text-3xl font-bold text-white md:text-5xl">
                Curated | Results
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {curatedCards.map((card) => (
                <article
                  key={card.title}
                  className={`stitch-ghost-border group flex flex-col overflow-hidden bg-[var(--landing-surface-low)] ${
                    card.featured ? 'border-t-2 border-t-[var(--landing-primary)]' : ''
                  }`}
                >
                  <div className="relative h-72 overflow-hidden bg-[var(--landing-surface-lowest)]">
                    <Image
                      src={card.image}
                      alt={card.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover opacity-80 grayscale transition duration-700 group-hover:scale-105 group-hover:opacity-100 group-hover:grayscale-0"
                    />
                    <div className="absolute left-4 top-4 border border-[var(--landing-tertiary)]/30 bg-[var(--landing-surface)] px-2 py-1">
                      <span className="stitch-label text-[9px] text-[var(--landing-tertiary)]">{card.badge}</span>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="stitch-headline text-xl font-bold text-white">{card.title}</h3>
                    <p className="mt-2 text-[11px] uppercase leading-6 tracking-[0.16em] text-[var(--landing-outline-bright)]">
                      {card.subtitle}
                    </p>

                    <div className="mt-8 flex items-end justify-between">
                      <div>
                        <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">Marketplace_Price</p>
                        <p className="stitch-headline mt-2 text-2xl font-bold text-[var(--landing-primary)]">{card.price}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`stitch-label mt-8 w-full border px-4 py-4 text-xs transition ${
                        card.featured
                          ? 'border-transparent bg-[var(--landing-primary)] text-white hover:-translate-y-0.5 hover:border-[var(--landing-tertiary)]'
                          : 'border-[var(--landing-outline)] bg-[var(--landing-surface-highest)] text-white hover:border-[var(--landing-tertiary)] hover:bg-[var(--landing-surface)]'
                      }`}
                    >
                      {card.action}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="bg-[var(--landing-surface-lowest)] px-4 py-24 sm:px-6 md:py-32"
          id="acquisition"
        >
          <div className="stitch-shell">
            <div className="mb-14 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="stitch-headline text-4xl font-bold text-white md:text-6xl">Orders | Tracking</h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-[var(--landing-muted)]">
                  Every completed purchase stays visible in the orders sidebar, with filters for type, phase, and
                  status.
                </p>
              </div>
            </div>

            <div className="grid gap-px bg-[var(--landing-outline)]/20 lg:grid-cols-3">
              {orderCards.map((card) => (
                <article key={card.title} className="group flex h-full flex-col bg-[var(--landing-surface)] p-6">
                  <div className="relative mb-6 h-72 overflow-hidden bg-[var(--landing-surface-lowest)]">
                    <Image
                      src={card.image}
                      alt={card.title}
                      fill
                      sizes="(max-width: 1024px) 100vw, 33vw"
                      className="object-cover opacity-80 grayscale transition duration-700 group-hover:opacity-100 group-hover:grayscale-0"
                    />
                  </div>

                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <h3 className="stitch-headline text-2xl font-bold text-white">{card.title}</h3>
                      <p className="mt-2 text-sm text-[var(--landing-muted)]">{card.subtitle}</p>
                    </div>

                    <div className="mt-8 flex items-end justify-between border-t border-[var(--landing-outline)]/20 pt-5">
                      <div>
                        <p className="stitch-label text-[10px] text-[var(--landing-outline-bright)]">Order_Status</p>
                        <p className="stitch-headline mt-2 text-2xl font-bold text-[var(--landing-tertiary)]">
                          {card.status}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="stitch-primary-button stitch-label inline-flex items-center gap-2 px-4 py-3 text-[10px]"
                      >
                        View Orders
                        <Package2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[var(--landing-surface-lowest)] px-4 py-10 sm:px-6">
        <div className="stitch-shell flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src={logoImage}
              alt="Mersi"
              width={28}
              height={28}
              className="h-7 w-7 rounded-none object-cover"
            />
            <span className="stitch-headline text-lg font-bold tracking-[0.18em] text-white">Mersi</span>
          </div>

          <div className="flex gap-6 text-[10px] uppercase tracking-[0.2em] text-[var(--landing-outline-bright)]">
            <Link className="transition-colors hover:text-[var(--landing-primary)]" href="#protocol">
              Features
            </Link>
            <Link className="transition-colors hover:text-[var(--landing-primary)]" href="#settlement">
              Checkout
            </Link>
            <Link className="transition-colors hover:text-[var(--landing-primary)]" href="#acquisition">
              Orders
            </Link>
          </div>

          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--landing-outline-bright)]">
            © 2026 Mersi // AI-powered shopping assistant
          </p>
        </div>
      </footer>
    </div>
  );
}
