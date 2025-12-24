import { NextResponse } from "next/server";
import { z } from "zod";

// Simple, deterministic prompt-improvement logic without external AI.
// Heuristics extract audience, purpose, tone, sections, and features, then
// format a clear, build-ready website prompt.
const CACHE_TTL_MS = 60_000;
const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute
const cache = new Map<string, { value: any; expiresAt: number }>();
const rateMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

type ImproveHints = {
  audience?: string[];
  siteType?: "saas" | "ecommerce" | "portfolio" | "restaurant" | "blog" | "event" | "booking" | "generic";
  tone?: string[];
  features?: string[];
  industries?: string[];
  regions?: string[];
  languages?: string[];
  currency?: string;
  pages?: string[];
  requiresPayments?: boolean;
  compliance?: string[];
  kpis?: string[];
  userStories?: string[];
  tech?: string[];
  contentChecklist?: string[];
  milestones?: string[];
  personas?: string[];
  projectMode?: boolean;
  outputLang?: "en" | "ar";
};

const hintsSchema = z.object({
  audience: z.array(z.string()).optional(),
  siteType: z.enum(["saas","ecommerce","portfolio","restaurant","blog","event","booking","generic"]).optional(),
  tone: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  currency: z.string().optional(),
  pages: z.array(z.string()).optional(),
  requiresPayments: z.boolean().optional(),
  compliance: z.array(z.string()).optional(),
  kpis: z.array(z.string()).optional(),
  userStories: z.array(z.string()).optional(),
  tech: z.array(z.string()).optional(),
  contentChecklist: z.array(z.string()).optional(),
  milestones: z.array(z.string()).optional(),
  personas: z.array(z.string()).optional(),
  projectMode: z.boolean().optional(),
  outputLang: z.enum(["en","ar"]).optional(),
}).passthrough();

const requestSchema = z.object({
  idea: z.string().refine((s) => typeof s === 'string' && s.trim().length > 0, {
    message: "'idea' must be a non-empty string",
  }),
  details: z.boolean().optional(),
  verbose: z.boolean().optional(),
  outputLang: z.enum(["en","ar"]).optional(),
  meta: z.any().optional(),
  brief: z.any().optional(),
  project: z.any().optional(),
  hints: z.any().optional(),
}).passthrough();
function improveIdea(raw: string, hints?: ImproveHints) {
  const startedAt = Date.now();
  const idea = (raw || "").trim();
  const lower = idea.toLowerCase();
  const lang: "en" | "ar" = (hints?.outputLang === "ar" ? "ar" : "en");

  // Basic signal extraction with lightweight heuristics
  const contains = (w: string | RegExp) =>
    typeof w === "string" ? lower.includes(w) : w.test(lower);

  // Audience
  let audience: string[] = [];
  const audienceHints: Record<string, string> = {
    designer: "Designers",
    designers: "Designers",
    مصمم: "Designers",
    مصممين: "Designers",
    developer: "Developers",
    developers: "Developers",
    مطور: "Developers",
    المطورين: "Developers",
    student: "Students",
    students: "Students",
    طالب: "Students",
    طلاب: "Students",
    photographer: "Photographers",
    photographers: "Photographers",
    مصور: "Photographers",
    المصورين: "Photographers",
    restaurant: "Local diners and food lovers",
    restaurants: "Local diners and food lovers",
    مطعم: "Local diners and food lovers",
    مطاعم: "Local diners and food lovers",
    nonprofit: "Donors and volunteers",
    nonprofits: "Donors and volunteers",
    جمعية: "Donors and volunteers",
    جمعيات: "Donors and volunteers",
    startup: "Early adopters and investors",
    startups: "Early adopters and investors",
    ناشئة: "Early adopters and investors",
    "ستارت اب": "Early adopters and investors",
    ecommerce: "Online shoppers",
    shop: "Online shoppers",
    shoppers: "Online shoppers",
    متجر: "Online shoppers",
    متسوقين: "Online shoppers",
    parents: "Parents",
    "أولياء الأمور": "Parents",
    teachers: "Teachers",
    معلمين: "Teachers",
    fitness: "Fitness enthusiasts",
    لياقة: "Fitness enthusiasts",
    realty: "Home buyers and sellers",
    realestate: "Home buyers and sellers",
    realtor: "Home buyers and sellers",
    عقارات: "Home buyers and sellers",
    b2b: "Business decision-makers",
    small: "Small business owners",
    "مشروع صغير": "Small business owners",
  };
  Object.keys(audienceHints).forEach((k) => {
    if (contains(k)) audience.push(audienceHints[k]);
  });
  if (audience.length === 0) audience = ["Prospective customers and early adopters"];
  audience = Array.from(new Set(audience));
  if (hints?.audience?.length) {
    for (const a of hints.audience) {
      if (a && !audience.includes(a)) audience.push(a);
    }
  }

  // Purpose / Site type
  type SiteType =
    | "saas"
    | "ecommerce"
    | "portfolio"
    | "restaurant"
    | "blog"
    | "event"
    | "booking"
    | "generic";
  let siteType: SiteType = contains(/saas|subscription|b2b|b2c|سوفت\s?وير|خدمة\s?سحابية/) ? "saas"
    : contains(/shop|store|ecommerce|checkout|cart|sell|buy|product|متجر|سلة|عربة|شراء|بيع|منتج|الدفع|تسوق/) ? "ecommerce"
    : contains(/portfolio|case study|case studies|work|dribbble|behance|photograph|أعمال|معرض|اعمالي|سيرة/) ? "portfolio"
    : contains(/restaurant|cafe|menu|reservation|reservations|booking|مطعم|قائمة|حجز|حجوزات/) ? "restaurant"
    : contains(/blog|articles|news|magazine|post\b|مدونة|مقالات|أخبار/) ? "blog"
    : contains(/event|conference|meetup|summit|webinar|launch|فعالية|مؤتمر|ندوة|قمة|ورشة/) ? "event"
    : contains(/book(ing)?|schedule|calendar|appointment|حجز|موعد|جدولة|تقويم/) ? "booking"
    : "generic";
  let projectMode = contains(/project|مشروع|mvp|scope|requirements?|spec|brief|proposal|plan|timeline|milestones?|deliverables?/);
  if (hints?.siteType) {
    const t = String(hints.siteType).toLowerCase() as SiteType;
    const allowed = ["saas","ecommerce","portfolio","restaurant","blog","event","booking","generic"];
    if ((allowed as any).includes(t)) {
      siteType = t as SiteType;
    }
  }
  if (typeof hints?.projectMode === "boolean" && hints.projectMode) {
    projectMode = true;
  }

  // Tone
  const toneWords: string[] = [];
  if (contains(/playful|مرح|مرِح/)) toneWords.push("playful");
  if (contains(/minimal|بسيط|مبسّط/)) toneWords.push("minimal");
  if (contains(/luxury|premium|فاخر|فخم/)) toneWords.push("premium");
  if (contains(/bold|جريء/)) toneWords.push("bold");
  if (contains(/friendly|ودود|لطيف/)) toneWords.push("friendly");
  if (contains(/confident|واثق/)) toneWords.push("confident");
  if (contains(/concise|موجز/)) toneWords.push("concise");
  if (toneWords.length === 0) toneWords.push("friendly", "confident", "concise");
  if (hints?.tone?.length) {
    for (const t of hints.tone) {
      if (t && !toneWords.includes(t)) toneWords.push(t);
    }
  }

  // Feature signals
  const featureMap: [RegExp, string][] = [
    [/pricing|plans|tiers|سعر|الأسعار|الخطط/, "Pricing with clear plan comparison"],
    [/faq|questions|أسئلة|الأسئلة\s*الشائعة/, "FAQ"],
    [/blog|article|news|مدونة|مقال|أخبار/, "Blog"],
    [/newsletter|subscribe|email list|النشرة|اشترك|قائمة\s*بريد/, "Newsletter signup"],
    [/testimonials|reviews|quotes|آراء|تقييمات|شهادات/, "Testimonials"],
    [/contact|support|help|اتصل|دعم|مساعدة/, "Contact form"],
    [/demo|trial|free trial|تجربة|عرض/, "Free trial / demo request"],
    [/login|signup|account|دخول|تسجيل|حساب/, "Authentication (sign up / log in)"],
    [/checkout|cart|buy|sell|product|الدفع|سلة|شراء|بيع|منتج/, "E-commerce checkout"],
    [/booking|schedule|calendar|appointment|reservation|حجز|موعد|جدولة|تقويم/, "Booking / scheduling"],
    [/search|بحث/, "Site search"],
  ];
  const features = Array.from(
    new Set(
      featureMap
        .filter(([k]) => contains(k))
        .map(([, v]) => v)
    )
  );
  if (hints?.features?.length) {
    for (const f of hints.features) {
      if (f && !features.includes(f)) features.push(f);
    }
  }

  // Default features by site type
  const defaultFeaturesByType: Record<SiteType, string[]> = {
    saas: [
      "Hero with value proposition and primary CTA",
      "Feature highlights",
      "Social proof and testimonials",
      "Pricing plans",
      "FAQ",
      "Footer with legal links",
    ],
    ecommerce: [
      "Featured products grid",
      "Product detail pages",
      "Cart and checkout",
      "Trust badges and reviews",
      "Newsletter signup",
    ],
    portfolio: [
      "Selected work/gallery",
      "About and services",
      "Testimonials",
      "Contact form",
      "Simple blog (optional)",
    ],
    restaurant: [
      "Hero with signature dish",
      "Menu",
      "Reservations / booking",
      "Location, hours, and map",
      "Photo gallery",
    ],
    blog: [
      "Latest posts",
      "Categories and tags",
      "Author bio",
      "Newsletter signup",
      "Search",
    ],
    event: [
      "Event overview",
      "Agenda / schedule",
      "Speakers",
      "Tickets / registration",
      "FAQ",
    ],
    booking: [
      "Service overview",
      "Calendar and availability",
      "Pricing",
      "Testimonials",
      "Contact",
    ],
    generic: [
      "Hero with value proposition",
      "Problem / solution",
      "Key features",
      "Social proof",
      "Primary CTA",
    ],
  };

  const sectionsByType: Record<SiteType, string[]> = {
    saas: ["Hero", "Problem", "Solution", "Features", "Testimonials", "Pricing", "FAQ", "Footer"],
    ecommerce: ["Hero", "Featured Products", "Collections", "Product Detail", "Cart / Checkout", "Footer"],
    portfolio: ["Hero", "Selected Work", "About", "Services", "Testimonials", "Contact"],
    restaurant: ["Hero", "Menu", "Gallery", "Reservations", "Location & Hours", "Contact"],
    blog: ["Hero", "Latest Posts", "Categories", "Featured Post", "About", "Newsletter"],
    event: ["Hero", "About Event", "Agenda", "Speakers", "Tickets", "FAQ"],
    booking: ["Hero", "Services", "Availability", "Pricing", "Testimonials", "Contact"],
    generic: ["Hero", "Benefits", "Features", "Social Proof", "CTA"],
  };

  const typeLabel: Record<SiteType, string> = {
    saas: "SaaS marketing site",
    ecommerce: "E‑commerce store",
    portfolio: "Portfolio site",
    restaurant: "Restaurant site",
    blog: "Blog / content hub",
    event: "Event landing page",
    booking: "Booking site",
    generic: "Landing page",
  };

  const statedGoal = idea.length > 0 ? idea.replace(/\s+/g, " ").slice(0, 280) : "";

  const selectedFeatures = Array.from(new Set([...
    defaultFeaturesByType[siteType],
    ...features,
  ]));

  const typeLabelAr: Record<SiteType, string> = {
    saas: "موقع تسويقي لخدمة سحابية",
    ecommerce: "متجر إلكتروني",
    portfolio: "موقع أعمال/معرض",
    restaurant: "موقع مطعم",
    blog: "مدونة / مركز محتوى",
    event: "صفحة هبوط لفعالية",
    booking: "موقع حجوزات",
    generic: "صفحة هبوط",
  };
  const secAr: Record<string, string> = {
    "Hero": "الرئيسية",
    "Problem": "المشكلة",
    "Solution": "الحل",
    "Features": "الميزات",
    "Testimonials": "آراء العملاء",
    "Pricing": "الأسعار",
    "FAQ": "الأسئلة الشائعة",
    "Footer": "التذييل",
    "Featured Products": "منتجات مميزة",
    "Collections": "التصنيفات",
    "Product Detail": "تفاصيل المنتج",
    "Cart / Checkout": "السلة / الدفع",
    "Selected Work": "أعمال مختارة",
    "About": "من نحن",
    "Services": "الخدمات",
    "Contact": "اتصل بنا",
    "Menu": "القائمة",
    "Gallery": "معرض الصور",
    "Reservations": "الحجوزات",
    "Location & Hours": "الموقع وساعات العمل",
    "Latest Posts": "أحدث المقالات",
    "Categories": "التصنيفات",
    "Featured Post": "مقال مميز",
    "Newsletter": "النشرة البريدية",
    "About Event": "عن الفعالية",
    "Agenda": "الجدول",
    "Speakers": "المتحدثون",
    "Tickets": "التذاكر",
    "Benefits": "الفوائد",
    "CTA": "دعوة للإجراء",
  };
  const audienceAr: Record<string, string> = {
    "Designers": "المصممون",
    "Developers": "المطورون",
    "Students": "الطلاب",
    "Photographers": "المصورون",
    "Local diners and food lovers": "عشاق الطعام ورواد المطاعم",
    "Donors and volunteers": "المتبرعون والمتطوعون",
    "Early adopters and investors": "المتبنون الأوائل والمستثمرون",
    "Online shoppers": "المتسوقون عبر الإنترنت",
    "Parents": "أولياء الأمور",
    "Teachers": "المعلمون",
    "Fitness enthusiasts": "مهتمو اللياقة",
    "Home buyers and sellers": "البائعون والمشترون للعقارات",
    "Business decision-makers": "صنّاع القرار في الأعمال",
    "Small business owners": "أصحاب المشاريع الصغيرة",
    "Prospective customers and early adopters": "العملاء المحتملون والمبكرون",
  };
  const toneAr: Record<string, string> = {
    "playful": "مرح",
    "minimal": "بسيط",
    "premium": "فاخر",
    "bold": "جريء",
    "friendly": "ودود",
    "confident": "واثق",
    "concise": "موجز",
  };
  const H = (k: string) => {
    if (lang === "ar") {
      const map: Record<string, string> = {
        "Project overview": "نظرة عامة على المشروع",
        "Target audience": "الجمهور المستهدف",
        "Primary goals": "الأهداف الرئيسية",
        "Tone & voice": "النبرة والأسلوب",
        "Suggested site structure": "هيكل الموقع المقترح",
        "Key features": "الميزات الأساسية",
        "Content & CTAs": "المحتوى والدعوات للإجراء",
        "Visual style": "الأسلوب البصري",
        "Notes from the original idea": "ملاحظات من الفكرة الأصلية",
        "Project blueprint": "مخطط المشروع",
        "Scope": "النطاق",
        "Pages & sitemap": "الصفحات وخريطة الموقع",
        "User stories": "قصص المستخدم",
        "Non-functional requirements": "متطلبات غير وظيفية",
        "KPIs": "المؤشرات الرئيسية",
        "Tech stack suggestions": "اقتراح التكديس التقني",
        "Content checklist": "قائمة المحتوى",
        "Milestones": "المعالم",
        "Questions to clarify": "أسئلة توضيحية",
      };
      return map[k] || k;
    }
    return k;
  };
  const mapSection = (s: string) => (lang === "ar" ? (secAr[s] || s) : s);
  const mapAudienceOut = (arr: string[]) => (lang === "ar" ? arr.map(a => audienceAr[a] || a) : arr);
  const mapToneOut = (arr: string[]) => (lang === "ar" ? arr.map(t => toneAr[t] || t) : arr);

  const primaryGoalsBullets = lang === "ar"
    ? [
        "- شرح المنتج/الخدمة بلغة بسيطة",
        "- بناء الثقة عبر الأدلة",
        "- توجيه الزائر إلى دعوة إجراء مركّزة (مثل التسجيل، الحجز، الشراء)",
      ].join("\n")
    : [
        "- Explain the product/service in plain language",
        "- Establish trust with proof",
        "- Guide visitors to a focused CTA (e.g., sign up, book, buy)",
      ].join("\n");
  const contentCtasBullets = lang === "ar"
    ? [
        "- عنوان واضح يشرح القيمة",
        "- عنوان فرعي يوضح ماذا ومن ولأي نتيجة",
        "- دعوة إجراء أساسية أعلى الصفحة (وثابتة على الجوال)",
        "- دعوة إجراء ثانوية للتقييم (مثل: اعرف المزيد)",
        "- مؤشرات الثقة: شعارات، آراء، تقييمات",
      ].join("\n")
    : [
        "- Clear headline that states the value",
        "- Subheadline that clarifies what, who, and outcome",
        "- Primary CTA above the fold (sticky on mobile)",
        "- Secondary CTA for evaluation (e.g., Learn more)",
        "- Trust signals: logos, testimonials, ratings",
      ].join("\n");
  const visualStyleBullets = lang === "ar"
    ? [
        "- تصميم نظيف وحديث وقابل للوصول",
        "- تباين عالٍ ومسافات مريحة وتصميم متجاوب",
        "- استخدام لون إبراز واحد وتناسق العناصر",
      ].join("\n")
    : [
        "- Clean, modern, accessible",
        "- High contrast, generous spacing, responsive layout",
        "- Use one accent color, consistent component styles",
      ].join("\n");

  const audienceOut = mapAudienceOut(audience);
  const toneOut = mapToneOut(toneWords);
  const typeLabelOut = lang === "ar" ? typeLabelAr[siteType] : typeLabel[siteType];
  const sectionsOut = sectionsByType[siteType].map((s) => `- ${mapSection(s)}`).join("\n");

  const overviewLine = lang === "ar"
    ? `بناء ${typeLabelOut} موجه لـ ${audienceOut.join(", ")}. الهدف هو توصيل القيمة بوضوح وزيادة التحويلات.`
    : `Build a ${typeLabelOut} for ${audienceOut.join(", ")}. The purpose is to clearly communicate value and drive conversions.`;
  const improved = [
    H("Project overview"),
    overviewLine,
    "",
    H("Target audience"),
    `- ${audienceOut.join("\n- ")}`,
    "",
    H("Primary goals"),
    primaryGoalsBullets,
    "",
    H("Tone & voice"),
    `- ${toneOut.join(", ")}`,
    "",
    H("Suggested site structure"),
    sectionsOut,
    "",
    H("Key features"),
    selectedFeatures.map((f) => `- ${f}`).join("\n"),
    "",
    H("Content & CTAs"),
    contentCtasBullets,
    "",
    H("Visual style"),
    visualStyleBullets,
    "",
    statedGoal ? H("Notes from the original idea") : undefined,
    statedGoal ? `- ${statedGoal}` : undefined,
  ].filter(Boolean).join("\n");

  const industryMap: [RegExp, string][] = [
    [/health|clinic|hospital|medic|pharma/, "Healthcare"],
    [/fintech|bank|payment|wallet|loan|finance|insur(tech)?/, "Fintech"],
    [/education|school|university|course|learning|edtech|teacher|student/, "Education"],
    [/real(\s)?estate|realt(y|or)|property/, "Real Estate"],
    [/travel|tour|flight|hotel|booking|trip|tourism/, "Travel"],
    [/ngo|nonprofit|charity|donor|volunteer/, "Nonprofit"],
    [/food|restaurant|cafe|menu|delivery|kitchen/, "Food & Beverage"],
    [/photograph|photo|gallery|camera/, "Photography"],
    [/ecommerce|shop|store|product|cart|checkout/, "E‑commerce"],
    [/saas|software|b2b|b2c/, "Software"],
    [/event|conference|webinar|summit/, "Events"],
  ];
  const industries = Array.from(new Set(industryMap.filter(([k]) => contains(k)).map(([, v]) => v)));
  if (industries.length === 0) industries.push("General");
  if (hints?.industries?.length) {
    for (const i of hints.industries) {
      if (i && !industries.includes(i)) industries.push(i);
    }
  }

  const usesArabic = contains(/arabic|عرب|عربي|rtl|\bar\b/);
  const languages = Array.from(new Set(usesArabic ? ["Arabic", "English"] : ["English"]));
  if (hints?.languages?.length) {
    for (const l of hints.languages) {
      if (l && !languages.includes(l)) languages.push(l);
    }
  }

  const regionMap: [RegExp, string][] = [
    [/egypt|egy|eg\b|cairo|giza|alex/, "Egypt"],
    [/ksa|saudi|riyadh|jedd?ah|sa\b/, "Saudi Arabia"],
    [/uae|dubai|abu\s?dhabi|ae\b|emirates/, "UAE"],
    [/morocco|ma\b|casablanca|rabat/, "Morocco"],
    [/tunisia|tn\b|tunis/, "Tunisia"],
    [/algeria|dz\b|algiers/, "Algeria"],
    [/jordan|jo\b|amman/, "Jordan"],
    [/iraq|iq\b|baghdad/, "Iraq"],
    [/usa|united states|us\b|america/, "USA"],
    [/uk|united kingdom|london|gb\b|great britain/, "UK"],
    [/europe|eu\b/, "Europe"],
    [/global|worldwide|international/, "Global"],
  ];
  const regions = Array.from(new Set(regionMap.filter(([k]) => contains(k)).map(([, v]) => v)));
  if (regions.length === 0) regions.push("Global");
  if (hints?.regions?.length) {
    for (const r of hints.regions) {
      if (r && !regions.includes(r)) regions.push(r);
    }
  }

  const currencyHints: [RegExp, string][] = [
    [/egp|جنيه|egypt|egy/, "EGP"],
    [/sar|ريال|ksa|saudi/, "SAR"],
    [/aed|درهم|uae|dubai/, "AED"],
    [/usd|dollar|usa|us\b/, "USD"],
    [/eur|euro/, "EUR"],
    [/gbp|pound|uk|sterling/, "GBP"],
  ];
  let currency = "USD";
  for (const [k, v] of currencyHints) {
    if (contains(k)) {
      currency = v;
      break;
    }
  }
  if (hints?.currency) {
    currency = String(hints.currency);
  }

  const requiresPayments = features.includes("E-commerce checkout") || contains(/payment|pay\b|checkout|stripe|paypal|paymob|fawry|mada|tabby|tamara/);
  const requiresPaymentsFinal = Boolean(hints?.requiresPayments ?? requiresPayments);

  const compliance: string[] = [];
  if (contains(/gdpr/)) compliance.push("GDPR");
  if (contains(/hipaa/)) compliance.push("HIPAA");
  if (contains(/pci/)) compliance.push("PCI DSS");
  if (contains(/soc\s*2|soc2/)) compliance.push("SOC 2");
  if (hints?.compliance?.length) {
    for (const c of hints.compliance) {
      if (c && !compliance.includes(c)) compliance.push(c);
    }
  }

  const pagesByType: Record<SiteType, string[]> = {
    saas: ["Home","Features","Pricing","Docs","Changelog","Blog","About","Contact","Login","Sign up","Dashboard"],
    ecommerce: ["Home","Shop","Collections","Product","Cart","Checkout","Account","Orders","Wishlist","Support","Blog"],
    portfolio: ["Home","Work","About","Services","Testimonials","Contact","Blog"],
    restaurant: ["Home","Menu","Reservations","Gallery","Location & Hours","About","Contact"],
    blog: ["Home","Blog","Post","Categories","About","Contact","Newsletter"],
    event: ["Home","About Event","Agenda","Speakers","Tickets","FAQ","Venue","Contact"],
    booking: ["Home","Services","Availability","Pricing","Book","Account","Contact","FAQ"],
    generic: ["Home","About","Features","Pricing","Contact","Blog"],
  };
  let pages = Array.from(new Set(pagesByType[siteType] || []));
  if (features.includes("Blog") && !pages.includes("Blog")) pages.push("Blog");
  if (hints?.pages?.length) {
    for (const p of hints.pages) {
      if (p && !pages.includes(p)) pages.push(p);
    }
  }
  if (requiresPaymentsFinal) {
    ["Billing","Checkout"].forEach(p => { if (!pages.includes(p)) pages.push(p); });
  }
  const slugify = (s: string) => "/" + s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const sitemap = pages.map((name) => ({ name, path: slugify(name) }));

  const userStoriesBase = [
    "As a visitor, I understand the value within 5 seconds",
    "As a visitor, I can complete the primary CTA easily",
    "As a visitor, I can trust the product via social proof",
  ];
  const userStoriesByType: Record<SiteType, string[]> = {
    saas: ["As a user, I can start a free trial","As a user, I can manage my plan and billing","As a user, I can reset my password","As an admin, I can see key metrics in the dashboard"],
    ecommerce: ["As a shopper, I can browse and filter products","As a shopper, I can add items to cart","As a shopper, I can checkout and pay securely","As a user, I can view my orders"],
    portfolio: ["As a client, I can view selected work","As a client, I can contact for a quote"],
    restaurant: ["As a guest, I can view the menu","As a guest, I can book a table","As a guest, I can see location and hours"],
    blog: ["As a reader, I can read and search posts","As a reader, I can subscribe to the newsletter"],
    event: ["As an attendee, I can view agenda and speakers","As an attendee, I can buy tickets and receive confirmation"],
    booking: ["As a client, I can view availability","As a client, I can book, reschedule, or cancel appointments"],
    generic: [],
  };
  const userStories = Array.from(new Set([...userStoriesBase, ...(userStoriesByType[siteType] || [])]));
  if (hints?.userStories?.length) {
    for (const s of hints.userStories) {
      if (s && !userStories.includes(s)) userStories.push(s);
    }
  }

  let techSuggestions: string[] = ["Next.js 14+", "React", "TypeScript", "Tailwind CSS", "shadcn/ui", "Prisma + PostgreSQL", "NextAuth or similar", "Vercel or similar hosting"];
  if (requiresPaymentsFinal) techSuggestions.push("Stripe (or regional: Paymob/Fawry/MADA)");
  if (usesArabic) techSuggestions.push("i18n with Arabic + RTL support");
  if (features.includes("Blog")) techSuggestions.push("MDX or headless CMS (e.g., Sanity)");
  techSuggestions = Array.from(new Set(techSuggestions));
  if (hints?.tech?.length) {
    for (const t of hints.tech) {
      if (t && !techSuggestions.includes(t)) techSuggestions.push(t);
    }
  }

  const nonFunctional = [
    "Performance: LCP < 2.5s, TTI < 3.5s",
    "Accessibility: WCAG 2.1 AA",
    "SEO: title/description, sitemap.xml, robots.txt, Open Graph",
    "Security: HTTPS, CSP, secrets management",
    "Analytics: conversion events and funnels",
    usesArabic ? "Internationalization: RTL and Arabic typography" : undefined,
  ].filter(Boolean) as string[];

  const kpisByType: Record<SiteType, string[]> = {
    saas: ["Signup conversion rate","Activation rate","Upgrade rate"],
    ecommerce: ["Add-to-cart rate","Checkout completion rate","Average order value"],
    portfolio: ["Contact inquiries","Proposal acceptance rate"],
    restaurant: ["Reservation completion rate","Menu views"],
    blog: ["Newsletter signups","Time on page"],
    event: ["Ticket sales","Registration conversion"],
    booking: ["Booking completion rate","No-show rate"],
    generic: ["Primary CTA conversion"],
  };
  const kpis = kpisByType[siteType] || [];
  if (hints?.kpis?.length) {
    for (const k of hints.kpis) {
      if (k && !kpis.includes(k)) kpis.push(k);
    }
  }

  const contentChecklist = [
    "Clear headline and subheadline",
    "Value proposition and benefits",
    "High-quality visuals or screenshots",
    "Social proof: logos, testimonials, ratings",
    "Pricing and plans (if applicable)",
    "FAQ and contact methods",
  ];
  if (hints?.contentChecklist?.length) {
    for (const v of hints.contentChecklist) {
      if (v && !contentChecklist.includes(v)) contentChecklist.push(v);
    }
  }

  const milestones = [
    "MVP skeleton (layout, navigation, theming)",
    "Core flows implemented",
    "Content integration and SEO",
    "QA: accessibility and performance",
    "Launch and analytics instrumentation",
  ];
  if (hints?.milestones?.length) {
    for (const m of hints.milestones) {
      if (m && !milestones.includes(m)) milestones.push(m);
    }
  }

  const personas = ["Visitor/Evaluator","Buyer/Decision-maker","Admin/Owner"];
  if (hints?.personas?.length) {
    for (const p of hints.personas) {
      if (p && !personas.includes(p)) personas.push(p);
    }
  }

  const clarifyingQuestions: string[] = [
    "What is the brand/product name?",
    "What is the one-line value proposition?",
    "Who is the primary audience and which market/region?",
    "What is the primary CTA (e.g., sign up, book, buy)?",
    "Do you have existing branding (logo, colors, typography)?",
    "What integrations are required (e.g., analytics, CRM, payment)?",
    "What is the launch timeline and key milestones?",
    "What budget or constraints should we consider?",
  ];
  if (requiresPaymentsFinal) clarifyingQuestions.push("Which payment gateways do you prefer (Stripe, Paymob, Fawry, MADA, etc.) and which currency to charge?");
  if (languages.includes("Arabic")) clarifyingQuestions.push("Do you require Arabic RTL support and translation for all pages?");
  if (siteType === "ecommerce") clarifyingQuestions.push("What is the product catalog size, categories, variants, shipping/returns policy?");
  if (siteType === "saas") clarifyingQuestions.push("What is the pricing model (free, freemium, trial), onboarding flow, and docs scope?");
  if (siteType === "booking") clarifyingQuestions.push("What services, durations, availability rules, and rescheduling/cancellation policies apply?");
  if (siteType === "event") clarifyingQuestions.push("What ticket types, seating, speakers, and content schedule are expected?");
  if (compliance.length) clarifyingQuestions.push("Do you need legal pages (Privacy, Terms, Cookies) and data retention policies aligned with compliance?");

  const projectBlueprint = [
    H("Project blueprint"),
    H("Scope"),
    (lang === "ar" ? `- الصناعة: ${industries.join(", ")}` : `- Industry: ${industries.join(", ")}`),
    (lang === "ar" ? `- المناطق: ${regions.join(", ")}` : `- Regions: ${regions.join(", ")}`),
    (lang === "ar" ? `- اللغات: ${languages.join(", ")}` : `- Languages: ${languages.join(", ")}`),
    (lang === "ar" ? `- العملة: ${currency}` : `- Currency: ${currency}`),
    ``,
    H("Pages & sitemap"),
    sitemap.map((p) => `- ${p.name} (${p.path})`).join("\n"),
    ``,
    H("User stories"),
    userStories.map((s) => `- ${s}`).join("\n"),
    ``,
    H("Non-functional requirements"),
    nonFunctional.map((s) => `- ${s}`).join("\n"),
    ``,
    H("KPIs"),
    kpis.map((s) => `- ${s}`).join("\n"),
    ``,
    H("Tech stack suggestions"),
    techSuggestions.map((s) => `- ${s}`).join("\n"),
    ``,
    H("Content checklist"),
    contentChecklist.map((s) => `- ${s}`).join("\n"),
    ``,
    H("Milestones"),
    milestones.map((s) => `- ${s}`).join("\n"),
    ``,
    H("Questions to clarify"),
    clarifyingQuestions.map((s) => `- ${s}`).join("\n"),
  ].join("\n");

  const improvedText = improved;

  const details = {
    audience,
    siteType,
    siteTypeLabel: typeLabel[siteType],
    tone: toneWords,
    suggestedSections: sectionsByType[siteType],
    defaultFeatures: defaultFeaturesByType[siteType],
    detectedFeatures: features,
    selectedFeatures,
    ideaLength: idea.length,
    wordCount: idea.length ? idea.split(/\s+/).filter(Boolean).length : 0,
    statedGoal,
    projectMode,
    industries,
    regions,
    languages,
    currency,
    requiresPayments: requiresPaymentsFinal,
    compliance,
    pages,
    sitemap,
    userStories,
    techSuggestions,
    nonFunctional,
    kpis,
    contentChecklist,
    milestones,
    personas,
    clarifyingQuestions,
    blueprint: projectMode ? projectBlueprint : undefined,
    outputLang: lang,
  };

  const processingMs = Date.now() - startedAt;
  return { improved: improvedText, processingMs, details };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const idea = parsed.data.idea.trim();
    const truncated = idea.slice(0, 4000);
    const includeDetails = Boolean(parsed.data.details ?? parsed.data.verbose ?? false);

    const ip = getClientIp(req);
    const now = Date.now();
    const rl = rateMap.get(ip);
    if (!rl || now > rl.resetAt) {
      rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    } else {
      if (rl.count >= RATE_LIMIT) {
        return NextResponse.json(
          { error: "Too many requests", meta: { resetAt: rl.resetAt } },
          { status: 429 }
        );
      }
      rl.count += 1;
      rateMap.set(ip, rl);
    }

    const rawHints = parsed.data as any;
    const mergedHintsCandidate = {
      ...(typeof rawHints?.meta === 'object' && rawHints.meta ? rawHints.meta : {}),
      ...(typeof rawHints?.brief === 'object' && rawHints.brief ? rawHints.brief : {}),
      ...(typeof rawHints?.project === 'object' && rawHints.project ? rawHints.project : {}),
      ...(typeof rawHints?.hints === 'object' && rawHints.hints ? rawHints.hints : {}),
    } as any;
    if (parsed.data.outputLang) {
      mergedHintsCandidate.outputLang = parsed.data.outputLang;
    }
    const hintsParsed = Object.keys(mergedHintsCandidate).length
      ? hintsSchema.safeParse(mergedHintsCandidate)
      : { success: true, data: undefined } as any;
    if (!hintsParsed.success) {
      return NextResponse.json(
        { error: "Invalid hints", issues: hintsParsed.error.issues },
        { status: 400 }
      );
    }
    const hints = hintsParsed.data;

    const cacheKey = JSON.stringify({ i: truncated, h: hints || null, d: includeDetails });
    const existing = cache.get(cacheKey);
    if (existing && existing.expiresAt > now) {
      return NextResponse.json(existing.value);
    }

    const { improved, processingMs, details } = improveIdea(truncated, hints);
    const response: any = { improved, meta: { processingMs } };
    if (includeDetails) {
      (response as any).details = details;
    }

    cache.set(cacheKey, { value: response, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error improving idea." },
      { status: 500 }
    );
  }
}
