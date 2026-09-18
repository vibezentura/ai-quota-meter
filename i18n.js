export const AI_QUOTA_LANGUAGE_STORAGE_KEY = "quota-local:language:v1";

// The flat key catalogs (locales-*.js) only cover static markup. Most of the
// dashboard's visible text is composed at runtime in app.js template strings
// (e.g. "Checked 5m ago", "3 refreshes"), and is never passed through a
// catalog key at all — it is scraped as literal English DOM text and matched
// back here. Each locale therefore needs FOUR translation layers, not one:
//   1. AI_QUOTA_EXACT[locale]    — whole composed sentences/phrases, exact match
//   2. AI_QUOTA_PATTERNS[locale] — regexes for sentences with one substituted value
//   3. AI_QUOTA_FRAGMENTS[locale]— short words/phrases embedded in other strings
//   4. the time-unit chain in translateCore — "5m ago", "1h 30m", etc.
// Adding a fifth language means populating all four for it, in addition to a
// locales-<code>.js catalog. Skipping 2-4 leaves every card, status pill, and
// dialog message silently in English while only static labels translate.
const AI_QUOTA_EXACT = Object.freeze({
  ar: Object.freeze({
    "Provider lane": "تصفية حسب المزوّد",
    "Account icon colour": "لون أيقونة الحساب",
    "Show passphrase": "إظهار عبارة المرور",
    "Hide passphrase": "إخفاء عبارة المرور",
    "Show API key": "إظهار مفتاح API",
    "Hide API key": "إخفاء مفتاح API",
    "Progress range": "نطاق التقدّم",
    "Detail range": "نطاق التفاصيل",
    "Local-only privacy": "خصوصية محلية فقط",
    "Refresh all usage": "تحديث استخدام جميع الحسابات",
    "AI Quota Meter home": "الصفحة الرئيسية لـ AI Quota Meter",
    "AI Quota Meter — Private AI usage dashboard": "AI Quota Meter — لوحة خاصة لمتابعة استخدام الذكاء الاصطناعي",
    "Provider settings and API keys are encrypted with AES-256-GCM before browser storage. Your passphrase is never saved.": "تُشفّر إعدادات المزوّد ومفاتيح API باستخدام AES-256-GCM قبل تخزينها في المتصفح. لا تُحفظ عبارة المرور.",
    "DeepSeek balance API ↗": "واجهة رصيد DeepSeek ‏API ↗",
    "Codex App Server ↗": "خادم تطبيق Codex ↗",
    "Skips the passphrase on reload. A derived key is kept in this browser's local storage—anyone with access to this browser profile could open the vault without your passphrase. Use Sign out to undo this.": "يتجاوز عبارة المرور عند إعادة التحميل. يُحفظ مفتاح مشتق في التخزين المحلي لهذا المتصفح؛ ويمكن لمن يصل إلى ملف المتصفح فتح الخزنة دون عبارة المرور. استخدم تسجيل الخروج للتراجع عن ذلك.",
    "Skips the passphrase on reload. A derived key is kept in this browser's local storage—anyone with access to this browser profile could open the vault without your passphrase. Use": "يتجاوز عبارة المرور عند إعادة التحميل. يُحفظ مفتاح مشتق في التخزين المحلي لهذا المتصفح؛ ويمكن لمن يصل إلى ملف المتصفح فتح الخزنة دون عبارة المرور. استخدم",
    "to undo this.": "للتراجع عن ذلك.",
    "This is only a private nickname. Internal connector IDs are generated automatically.": "هذا لقب خاص فقط. تُنشأ معرّفات الاتصال الداخلية تلقائيًا.",
    "Uses the Claude login already on this computer. Nothing to type.": "يستخدم تسجيل دخول Claude الموجود على هذا الكمبيوتر. لا حاجة إلى كتابة شيء.",
    "Uses the Codex login already on this computer. Nothing to type.": "يستخدم تسجيل دخول Codex الموجود على هذا الكمبيوتر. لا حاجة إلى كتابة شيء.",
    "Opens a sign-in window so you can add a second account. Your current login is left alone.": "يفتح نافذة تسجيل دخول لإضافة حساب ثانٍ، مع إبقاء تسجيل دخولك الحالي كما هو.",
    "How much of the weekly limit to hold back. Once this account would drop below it, AI Quota Meter stops suggesting it and points you at another account instead.": "النسبة التي تريد الاحتفاظ بها من الحد الأسبوعي. عندما ينخفض الحساب دونها، يتوقف AI Quota Meter عن اقتراحه ويوجّهك إلى حساب آخر.",
    "Checking usage is free — the 5-hour and weekly numbers come from Anthropic's own usage endpoint and never spend message quota.": "التحقق من الاستخدام مجاني—تأتي أرقام الخمس ساعات والأسبوع من واجهة Anthropic ولا تستهلك حصة الرسائل.",
    "The key is encrypted in your browser and sent only to the local companion, which checks DeepSeek over TLS.": "يُشفّر المفتاح في متصفحك ولا يُرسل إلا إلى المرافق المحلي الذي يتحقق من DeepSeek عبر TLS.",
    "The key is encrypted in your browser and sent only to this loopback companion, which checks DeepSeek over TLS.": "يُشفّر المفتاح في متصفحك ولا يُرسل إلا إلى هذا المرافق المحلي الذي يتحقق من DeepSeek عبر TLS.",
    "Used only for the official balance endpoint. It is never written to server logs or plaintext storage.": "يُستخدم فقط مع واجهة الرصيد الرسمية، ولا يُكتب في سجلات الخادم أو في تخزين غير مشفّر.",
    "Select the DeepSeek amount-*.csv export. It is parsed in this tab; only encrypted aggregates are saved.": "اختر ملف DeepSeek ‏amount-*.csv. يُحلّل في علامة التبويب هذه ولا تُحفظ إلا النتائج المجمّعة المشفّرة.",
    "Select the DeepSeek": "اختر ملف DeepSeek",
    "export. It is parsed in this tab; only encrypted aggregates are saved.": "المصدّر. يُحلّل في علامة التبويب هذه ولا تُحفظ إلا النتائج المجمّعة المشفّرة.",
    "A sign-in window has opened. Follow the steps in it — this page continues on its own when you're done.": "فُتحت نافذة تسجيل الدخول. اتبع الخطوات فيها وستتابع هذه الصفحة تلقائيًا عند الانتهاء.",
    "Paste this into the terminal you use, then come back — this page still picks it up automatically.": "الصق هذا في الطرفية التي تستخدمها ثم عد—ستكتشفه الصفحة تلقائيًا.",
    "Sign in to reconnect": "سجّل الدخول لإعادة الربط",
    "Select Open sign-in window below. Follow the steps in the window that opens — this page reconnects on its own when you're done.": "اختر فتح نافذة تسجيل الدخول أدناه واتبع الخطوات. ستعيد الصفحة الربط تلقائيًا عند الانتهاء.",
    "AES-256-GCM vault": "خزنة AES-256-GCM",
    "PBKDF2-HMAC-SHA256 · 600,000 iterations · manual lock controls": "PBKDF2-HMAC-SHA256 · ‏600,000 دورة · تحكم يدوي بالقفل",
    "No encrypted account profiles yet.": "لا توجد ملفات حسابات مشفّرة بعد.",
    "Match your system, or pin the dashboard to light or dark": "طابق النظام أو ثبّت لوحة المعلومات على الوضع الفاتح أو الداكن",
    "Dashboard cards hide the account identity line entirely—useful when sharing your screen": "تخفي بطاقات اللوحة سطر هوية الحساب بالكامل—مفيد عند مشاركة الشاشة",
    "Safe to store; still requires your passphrase": "آمنة للتخزين؛ وتظل بحاجة إلى عبارة المرور",
    "Replaces the vault in this browser after confirmation": "تستبدل الخزنة في هذا المتصفح بعد التأكيد",
    "Claude/Codex schema-v1 JSON; current tab only": "ملف JSON من Claude/Codex بالمخطط v1؛ لعلامة التبويب الحالية فقط",
    "Clears decrypted account data from memory; still requires your passphrase": "يمسح بيانات الحساب المفكوكة من الذاكرة؛ وتظل بحاجة إلى عبارة المرور",
    "Forgets this device—removes the stay-signed-in key so reload asks for your passphrase again": "ينسى هذا الجهاز—يحذف مفتاح البقاء مسجّلًا ليطلب إعادة التحميل عبارة المرور مجددًا",
    "Removes encrypted data from this browser only": "يحذف البيانات المشفّرة من هذا المتصفح فقط",
    "Account secrets are encrypted at rest and never accepted by a public-hosted connector.": "تُشفّر أسرار الحساب عند التخزين ولا يقبلها أي موصّل مستضاف للعامة.",
    "Build your little AI team": "كوّن فريق أدوات الذكاء الاصطناعي الخاص بك",
    "Add Claude, Codex, or DeepSeek to see every limit in one happy place. Only DeepSeek needs an API key, and the app accepts it only on localhost.": "أضف Claude أو Codex أو DeepSeek لرؤية كل الحدود في مكان واحد. يحتاج DeepSeek فقط إلى مفتاح API، ولا يقبله التطبيق إلا محليًا.",
    "Reset events appear after a local Claude or Codex connector reports usage.": "تظهر مواعيد إعادة التعيين بعد أن يرسل موصّل Claude أو Codex المحلي بيانات الاستخدام.",
    "Deltas compare consecutive refreshes of the same window. Refreshes more than 90 minutes apart start a new session. A window that reset in between counts only the new window's usage.": "تقارن الفروق عمليات التحقق المتتالية للنافذة نفسها. تبدأ جلسة جديدة عندما يزيد الفاصل بين عمليتي تحقق على 90 دقيقة. إذا أُعيد تعيين نافذة بينهما، يُحتسب استخدام النافذة الجديدة فقط.",
    "Loopback verified. Your secrets are encrypted at rest, and every provider check stays between this machine and that provider.": "تم التحقق من الاتصال المحلي. أسرارك مشفّرة عند التخزين، وكل تحقق من المزوّد يبقى بين هذا الجهاز وذلك المزوّد.",
    "Offline mode: the encrypted vault works here. Start the local companion for live DeepSeek credits.": "وضع عدم الاتصال: تعمل الخزنة المشفّرة هنا. شغّل المرافق المحلي لرصيد DeepSeek المباشر.",
    "Hosted mode: API-key connectors are switched off. Run the app locally to connect DeepSeek.": "الوضع المستضاف: موصّلات مفاتيح API معطّلة. شغّل التطبيق محليًا لربط DeepSeek.",
    "Usage over time": "الاستخدام بمرور الوقت",
    "Usage per refresh": "الاستخدام لكل تحقق",
    "Usage per refresh, oldest to newest": "الاستخدام لكل تحقق، من الأقدم إلى الأحدث",
    "Charts & data ↗": "الرسوم والبيانات ↗",
    "Imported key usage": "استخدام المفاتيح المستورد",
    "No per-key usage imported yet": "لم يُستورد استخدام حسب المفتاح بعد",
    "Add DeepSeek’s amount CSV export to see tokens per key": "أضف ملف CSV الخاص بالكميات من DeepSeek لرؤية الرموز لكل مفتاح",
    "No key label": "مفتاح بلا تسمية",
    "local CLI": "CLI محلي",
    "API credits": "رصيد API",
    "Check login": "تحقق من تسجيل الدخول",
    "Connect to read credits": "اتصل لقراءة الرصيد",
    "Import usage": "استيراد الاستخدام",
    "Check now": "تحقق الآن",
    "No meaningful unused-capacity risk is projected.": "لا يُتوقع ضياع رصيد ذي قيمة.",
    "no session spend yet": "لا يوجد استهلاك في الجلسة بعد",
    "Credits spent per refresh": "الرصيد المستهلَك لكل تحقق",
    "no usage": "لا يوجد استخدام",
    "total": "الإجمالي",
    "rows": "صفوف",
    "average": "متوسط",
    "limit in": "الوصول إلى الحد خلال",
    "this session": "هذه الجلسة",
    "sessions at your typical": "جلسات بمعدلك المعتاد",
    "may go unused": "قد لا يُستخدم",
    "before reset": "قبل إعادة التعيين",
    "Expected reset; waiting for confirmation": "موعد إعادة التعيين متوقع؛ بانتظار التأكيد",
    "verified API key": "مفتاح API موثّق",
    "legacy profile": "ملف قديم",
    "CLI identity verified": "تم التحقق من هوية CLI",
    "Fictional demo profile": "ملف تجريبي وهمي",
    "Unverified legacy profile": "ملف قديم غير موثّق",
    "Never synced": "لم تتم المزامنة",
    "Just now": "الآن",
    "rose": "وردي", "gold": "ذهبي", "lime": "ليموني", "cyan": "سماوي",
    "sky": "أزرق سماوي", "indigo": "نيلي", "violet": "بنفسجي", "pink": "زهري",
    "Remove this encrypted account profile from this browser vault? Provider credentials outside this app are not changed.": "هل تريد إزالة ملف الحساب المشفّر هذا من خزنة المتصفح؟ لن تتغير بيانات اعتماد المزوّد خارج التطبيق.",
    "Replace the encrypted vault currently stored in this browser? Export it first if needed.": "هل تريد استبدال الخزنة المشفّرة المحفوظة حاليًا في هذا المتصفح؟ صدّرها أولًا إذا احتجت إليها.",
    "Permanently remove this encrypted vault from this browser? This cannot be recovered without an exported backup.": "هل تريد حذف هذه الخزنة المشفّرة نهائيًا من المتصفح؟ لا يمكن استردادها دون نسخة احتياطية مصدّرة.",
    "Run AI Quota Meter on localhost to connect subscription accounts.": "شغّل AI Quota Meter محليًا لربط حسابات الاشتراك.",
    "The local provider check failed.": "فشل التحقق من المزوّد المحلي.",
    "Could not add this account.": "تعذّرت إضافة هذا الحساب.",
    "Could not reconnect this account.": "تعذّرت إعادة ربط هذا الحساب.",
    "Could not open the sign-in window.": "تعذّر فتح نافذة تسجيل الدخول.",
    "Incorrect passphrase or damaged vault.": "عبارة المرور غير صحيحة أو الخزنة تالفة.",
    "Use a master passphrase of at least 12 characters.": "استخدم عبارة مرور رئيسية من 12 حرفًا على الأقل.",
    "The passphrases do not match.": "عبارتا المرور غير متطابقتين.",
    "Export failed.": "فشل التصدير.",
    "Import failed.": "فشل الاستيراد.",
    "Snapshot import failed.": "فشل استيراد اللقطة.",
    "Usage import failed.": "فشل استيراد الاستخدام.",
    "Enter a name.": "أدخل اسمًا.",
    "Could not save this name.": "تعذّر حفظ هذا الاسم.",
    "Copy failed. Select the command text and copy it manually.": "فشل النسخ. حدّد نص الأمر وانسخه يدويًا.",
    "DeepSeek keys are accepted only by the loopback-local app.": "لا تُقبل مفاتيح DeepSeek إلا في التطبيق المحلي.",
    "DeepSeek rejected this API key.": "رفض DeepSeek مفتاح API هذا.",
    "Could not read DeepSeek balance.": "تعذّرت قراءة رصيد DeepSeek.",
    "Local account setup is available only through the loopback app.": "إعداد الحساب المحلي متاح فقط عبر التطبيق المحلي.",
    "Opening a sign-in terminal is available only through the loopback app.": "فتح طرفية تسجيل الدخول متاح فقط عبر التطبيق المحلي.",
    "Could not open a sign-in terminal for this profile.": "تعذّر فتح طرفية تسجيل الدخول لهذا الملف.",
    "Claude connection is available only through the loopback app.": "اتصال Claude متاح فقط عبر التطبيق المحلي.",
    "Claude usage sync is available only through the loopback app.": "مزامنة استخدام Claude متاحة فقط عبر التطبيق المحلي.",
    "Codex connection is available only through the loopback app.": "اتصال Codex متاح فقط عبر التطبيق المحلي.",
    "Could not inspect the local Claude Code account. Confirm that Claude Code is installed.": "تعذّر فحص حساب Claude Code المحلي. تأكد من تثبيت Claude Code.",
    "Could not inspect the local Codex account. Confirm that Codex CLI is installed.": "تعذّر فحص حساب Codex المحلي. تأكد من تثبيت Codex CLI.",
    "Usage data unavailable": "بيانات الاستخدام غير متاحة",
  }),
  fr: Object.freeze({
    "Provider lane": "Filtre par fournisseur",
    "Account icon colour": "Couleur de l’icône du compte",
    "Show passphrase": "Afficher la phrase secrète",
    "Hide passphrase": "Masquer la phrase secrète",
    "Show API key": "Afficher la clé API",
    "Hide API key": "Masquer la clé API",
    "Progress range": "Plage de progression",
    "Detail range": "Plage de détail",
    "Local-only privacy": "Confidentialité strictement locale",
    "Refresh all usage": "Actualiser toute l’utilisation",
    "AI Quota Meter home": "Accueil d’AI Quota Meter",
    "AI Quota Meter — Private AI usage dashboard": "AI Quota Meter — Tableau de bord privé d’utilisation de l’IA",
    "Provider settings and API keys are encrypted with AES-256-GCM before browser storage. Your passphrase is never saved.": "Les paramètres du fournisseur et les clés API sont chiffrés avec AES-256-GCM avant d’être stockés dans le navigateur. Votre phrase secrète n’est jamais enregistrée.",
    "DeepSeek balance API ↗": "API de solde DeepSeek ↗",
    "Codex App Server ↗": "Serveur d’application Codex ↗",
    "Skips the passphrase on reload. A derived key is kept in this browser's local storage—anyone with access to this browser profile could open the vault without your passphrase. Use Sign out to undo this.": "Ignore la phrase secrète au rechargement. Une clé dérivée est conservée dans le stockage local de ce navigateur — quiconque a accès à ce profil de navigateur pourrait ouvrir le coffre sans votre phrase secrète. Utilisez Se déconnecter pour annuler cela.",
    "Skips the passphrase on reload. A derived key is kept in this browser's local storage—anyone with access to this browser profile could open the vault without your passphrase. Use": "Ignore la phrase secrète au rechargement. Une clé dérivée est conservée dans le stockage local de ce navigateur — quiconque a accès à ce profil de navigateur pourrait ouvrir le coffre sans votre phrase secrète. Utilisez",
    "to undo this.": "pour annuler cela.",
    "This is only a private nickname. Internal connector IDs are generated automatically.": "Il ne s’agit que d’un surnom privé. Les identifiants internes de connecteur sont générés automatiquement.",
    "Uses the Claude login already on this computer. Nothing to type.": "Utilise la connexion Claude déjà présente sur cet ordinateur. Rien à saisir.",
    "Uses the Codex login already on this computer. Nothing to type.": "Utilise la connexion Codex déjà présente sur cet ordinateur. Rien à saisir.",
    "Opens a sign-in window so you can add a second account. Your current login is left alone.": "Ouvre une fenêtre de connexion pour ajouter un second compte. Votre connexion actuelle reste inchangée.",
    "How much of the weekly limit to hold back. Once this account would drop below it, AI Quota Meter stops suggesting it and points you at another account instead.": "Quelle part de la limite hebdomadaire conserver en réserve. Dès que ce compte passerait sous ce seuil, AI Quota Meter cesse de le suggérer et vous oriente vers un autre compte.",
    "Checking usage is free — the 5-hour and weekly numbers come from Anthropic's own usage endpoint and never spend message quota.": "Vérifier l’utilisation est gratuit — les chiffres des 5 heures et de la semaine proviennent du point de terminaison d’utilisation propre à Anthropic et ne consomment jamais de quota de messages.",
    "The key is encrypted in your browser and sent only to the local companion, which checks DeepSeek over TLS.": "La clé est chiffrée dans votre navigateur et n’est envoyée qu’au compagnon local, qui interroge DeepSeek via TLS.",
    "The key is encrypted in your browser and sent only to this loopback companion, which checks DeepSeek over TLS.": "La clé est chiffrée dans votre navigateur et n’est envoyée qu’à ce compagnon en boucle locale, qui interroge DeepSeek via TLS.",
    "Used only for the official balance endpoint. It is never written to server logs or plaintext storage.": "Utilisée uniquement pour le point de terminaison officiel de solde. Elle n’est jamais écrite dans les journaux du serveur ni dans un stockage en clair.",
    "Select the DeepSeek amount-*.csv export. It is parsed in this tab; only encrypted aggregates are saved.": "Sélectionnez le fichier d’export DeepSeek amount-*.csv. Il est analysé dans cet onglet ; seuls les agrégats chiffrés sont enregistrés.",
    "Select the DeepSeek": "Sélectionnez le fichier d’export DeepSeek",
    "export. It is parsed in this tab; only encrypted aggregates are saved.": ". Il est analysé dans cet onglet ; seuls les agrégats chiffrés sont enregistrés.",
    "A sign-in window has opened. Follow the steps in it — this page continues on its own when you're done.": "Une fenêtre de connexion s’est ouverte. Suivez les étapes qu’elle indique — cette page continue automatiquement une fois terminé.",
    "Paste this into the terminal you use, then come back — this page still picks it up automatically.": "Collez ceci dans le terminal que vous utilisez, puis revenez — cette page le détectera quand même automatiquement.",
    "Sign in to reconnect": "Connectez-vous pour vous reconnecter",
    "Select Open sign-in window below. Follow the steps in the window that opens — this page reconnects on its own when you're done.": "Sélectionnez Ouvrir la fenêtre de connexion ci-dessous. Suivez les étapes dans la fenêtre qui s’ouvre — cette page se reconnecte automatiquement une fois terminé.",
    "AES-256-GCM vault": "Coffre AES-256-GCM",
    "PBKDF2-HMAC-SHA256 · 600,000 iterations · manual lock controls": "PBKDF2-HMAC-SHA256 · 600 000 itérations · verrouillage manuel",
    "No encrypted account profiles yet.": "Aucun profil de compte chiffré pour le moment.",
    "Match your system, or pin the dashboard to light or dark": "Suivez votre système, ou fixez le tableau de bord en mode clair ou sombre",
    "Dashboard cards hide the account identity line entirely—useful when sharing your screen": "Les cartes du tableau de bord masquent entièrement la ligne d’identité du compte — utile lors du partage d’écran",
    "Safe to store; still requires your passphrase": "Peut être conservé en toute sécurité ; requiert toujours votre phrase secrète",
    "Replaces the vault in this browser after confirmation": "Remplace le coffre de ce navigateur après confirmation",
    "Claude/Codex schema-v1 JSON; current tab only": "JSON au schéma v1 Claude/Codex ; onglet actuel uniquement",
    "Clears decrypted account data from memory; still requires your passphrase": "Efface les données de compte déchiffrées de la mémoire ; requiert toujours votre phrase secrète",
    "Forgets this device—removes the stay-signed-in key so reload asks for your passphrase again": "Oublie cet appareil — supprime la clé de connexion persistante afin qu’un rechargement redemande votre phrase secrète",
    "Removes encrypted data from this browser only": "Supprime les données chiffrées de ce navigateur uniquement",
    "Account secrets are encrypted at rest and never accepted by a public-hosted connector.": "Les secrets de compte sont chiffrés au repos et ne sont jamais acceptés par un connecteur hébergé publiquement.",
    "Build your little AI team": "Constituez votre petite équipe d’IA",
    "Add Claude, Codex, or DeepSeek to see every limit in one happy place. Only DeepSeek needs an API key, and the app accepts it only on localhost.": "Ajoutez Claude, Codex ou DeepSeek pour voir toutes les limites au même endroit. Seul DeepSeek nécessite une clé API, et l’application ne l’accepte qu’en local (localhost).",
    "Reset events appear after a local Claude or Codex connector reports usage.": "Les événements de réinitialisation apparaissent après qu’un connecteur Claude ou Codex local ait signalé une utilisation.",
    "Deltas compare consecutive refreshes of the same window. Refreshes more than 90 minutes apart start a new session. A window that reset in between counts only the new window's usage.": "Les écarts comparent des vérifications consécutives de la même fenêtre. Des vérifications espacées de plus de 90 minutes démarrent une nouvelle session. Une fenêtre réinitialisée entre-temps ne compte que l’utilisation de la nouvelle fenêtre.",
    "Loopback verified. Your secrets are encrypted at rest, and every provider check stays between this machine and that provider.": "Boucle locale vérifiée. Vos secrets sont chiffrés au repos, et chaque vérification de fournisseur reste entre cette machine et ce fournisseur.",
    "Offline mode: the encrypted vault works here. Start the local companion for live DeepSeek credits.": "Mode hors ligne : le coffre chiffré fonctionne ici. Démarrez le compagnon local pour les crédits DeepSeek en direct.",
    "Hosted mode: API-key connectors are switched off. Run the app locally to connect DeepSeek.": "Mode hébergé : les connecteurs à clé API sont désactivés. Exécutez l’application en local pour connecter DeepSeek.",
    "Usage over time": "Utilisation dans le temps",
    "Usage per refresh": "Utilisation par vérification",
    "Usage per refresh, oldest to newest": "Utilisation par vérification, de la plus ancienne à la plus récente",
    "Charts & data ↗": "Graphiques et données ↗",
    "Imported key usage": "Utilisation importée par clé",
    "No per-key usage imported yet": "Aucune utilisation par clé importée pour le moment",
    "Add DeepSeek’s amount CSV export to see tokens per key": "Ajoutez l’export CSV de montants de DeepSeek pour voir les jetons par clé",
    "No key label": "Aucune étiquette de clé",
    "local CLI": "CLI locale",
    "API credits": "Crédits API",
    "Check login": "Vérifier la connexion",
    "Connect to read credits": "Connecter pour lire les crédits",
    "Import usage": "Importer l’utilisation",
    "Check now": "Vérifier maintenant",
    "No meaningful unused-capacity risk is projected.": "Aucun risque significatif de capacité inutilisée n’est prévu.",
    "no session spend yet": "aucune dépense de session pour le moment",
    "Credits spent per refresh": "Crédits consommés par vérification",
    "no usage": "aucune utilisation",
    "total": "total",
    "rows": "lignes",
    "average": "moyenne",
    "limit in": "limite dans",
    "this session": "cette session",
    "sessions at your typical": "sessions à votre taille habituelle",
    "may go unused": "risque de ne pas être utilisé",
    "before reset": "avant réinitialisation",
    "Expected reset; waiting for confirmation": "Réinitialisation prévue ; en attente de confirmation",
    "verified API key": "clé API vérifiée",
    "legacy profile": "profil hérité",
    "CLI identity verified": "identité CLI vérifiée",
    "Fictional demo profile": "Profil de démonstration fictif",
    "Unverified legacy profile": "Profil hérité non vérifié",
    "Never synced": "Jamais synchronisé",
    "Just now": "À l’instant",
    "rose": "Vieux rose", "gold": "Or", "lime": "Citron vert", "cyan": "Cyan",
    "sky": "Bleu ciel", "indigo": "Indigo", "violet": "Violet", "pink": "Rose",
    "Remove this encrypted account profile from this browser vault? Provider credentials outside this app are not changed.": "Retirer ce profil de compte chiffré du coffre de ce navigateur ? Les identifiants du fournisseur en dehors de cette application ne sont pas modifiés.",
    "Replace the encrypted vault currently stored in this browser? Export it first if needed.": "Remplacer le coffre chiffré actuellement stocké dans ce navigateur ? Exportez-le d’abord si nécessaire.",
    "Permanently remove this encrypted vault from this browser? This cannot be recovered without an exported backup.": "Supprimer définitivement ce coffre chiffré de ce navigateur ? Il ne pourra pas être récupéré sans une sauvegarde exportée.",
    "Run AI Quota Meter on localhost to connect subscription accounts.": "Exécutez AI Quota Meter sur localhost pour connecter des comptes d’abonnement.",
    "The local provider check failed.": "La vérification du fournisseur local a échoué.",
    "Could not add this account.": "Impossible d’ajouter ce compte.",
    "Could not reconnect this account.": "Impossible de reconnecter ce compte.",
    "Could not open the sign-in window.": "Impossible d’ouvrir la fenêtre de connexion.",
    "Incorrect passphrase or damaged vault.": "Phrase secrète incorrecte ou coffre endommagé.",
    "Use a master passphrase of at least 12 characters.": "Utilisez une phrase secrète principale d’au moins 12 caractères.",
    "The passphrases do not match.": "Les phrases secrètes ne correspondent pas.",
    "Export failed.": "Échec de l’export.",
    "Import failed.": "Échec de l’import.",
    "Snapshot import failed.": "Échec de l’import de l’instantané.",
    "Usage import failed.": "Échec de l’import de l’utilisation.",
    "Enter a name.": "Saisissez un nom.",
    "Could not save this name.": "Impossible d’enregistrer ce nom.",
    "Copy failed. Select the command text and copy it manually.": "Échec de la copie. Sélectionnez le texte de la commande et copiez-le manuellement.",
    "DeepSeek keys are accepted only by the loopback-local app.": "Les clés DeepSeek ne sont acceptées que par l’application locale en boucle locale.",
    "DeepSeek rejected this API key.": "DeepSeek a rejeté cette clé API.",
    "Could not read DeepSeek balance.": "Impossible de lire le solde DeepSeek.",
    "Local account setup is available only through the loopback app.": "La configuration de compte local n’est disponible que via l’application en boucle locale.",
    "Opening a sign-in terminal is available only through the loopback app.": "L’ouverture d’un terminal de connexion n’est disponible que via l’application en boucle locale.",
    "Could not open a sign-in terminal for this profile.": "Impossible d’ouvrir un terminal de connexion pour ce profil.",
    "Claude connection is available only through the loopback app.": "La connexion Claude n’est disponible que via l’application en boucle locale.",
    "Claude usage sync is available only through the loopback app.": "La synchronisation de l’utilisation Claude n’est disponible que via l’application en boucle locale.",
    "Codex connection is available only through the loopback app.": "La connexion Codex n’est disponible que via l’application en boucle locale.",
    "Could not inspect the local Claude Code account. Confirm that Claude Code is installed.": "Impossible d’examiner le compte Claude Code local. Vérifiez que Claude Code est installé.",
    "Could not inspect the local Codex account. Confirm that Codex CLI is installed.": "Impossible d’examiner le compte Codex local. Vérifiez que Codex CLI est installé.",
    "Usage data unavailable": "Données d’utilisation indisponibles",
  }),
  de: Object.freeze({
    "Provider lane": "Anbieterfilter",
    "Account icon colour": "Kontosymbolfarbe",
    "Show passphrase": "Passphrase anzeigen",
    "Hide passphrase": "Passphrase verbergen",
    "Show API key": "API-Schlüssel anzeigen",
    "Hide API key": "API-Schlüssel verbergen",
    "Progress range": "Fortschrittszeitraum",
    "Detail range": "Detailzeitraum",
    "Local-only privacy": "Ausschließlich lokaler Datenschutz",
    "Refresh all usage": "Gesamte Nutzung aktualisieren",
    "AI Quota Meter home": "AI Quota Meter Startseite",
    "AI Quota Meter — Private AI usage dashboard": "AI Quota Meter — Privates Dashboard für KI-Nutzung",
    "Provider settings and API keys are encrypted with AES-256-GCM before browser storage. Your passphrase is never saved.": "Anbietereinstellungen und API-Schlüssel werden mit AES-256-GCM verschlüsselt, bevor sie im Browser gespeichert werden. Ihre Passphrase wird nie gespeichert.",
    "DeepSeek balance API ↗": "DeepSeek-Guthaben-API ↗",
    "Codex App Server ↗": "Codex App Server ↗",
    "Skips the passphrase on reload. A derived key is kept in this browser's local storage—anyone with access to this browser profile could open the vault without your passphrase. Use Sign out to undo this.": "Überspringt die Passphrase beim Neuladen. Ein abgeleiteter Schlüssel wird im lokalen Speicher dieses Browsers aufbewahrt — jeder mit Zugriff auf dieses Browserprofil könnte den Tresor ohne Ihre Passphrase öffnen. Verwenden Sie Abmelden, um dies rückgängig zu machen.",
    "Skips the passphrase on reload. A derived key is kept in this browser's local storage—anyone with access to this browser profile could open the vault without your passphrase. Use": "Überspringt die Passphrase beim Neuladen. Ein abgeleiteter Schlüssel wird im lokalen Speicher dieses Browsers aufbewahrt — jeder mit Zugriff auf dieses Browserprofil könnte den Tresor ohne Ihre Passphrase öffnen. Verwenden Sie",
    "to undo this.": "um dies rückgängig zu machen.",
    "This is only a private nickname. Internal connector IDs are generated automatically.": "Dies ist nur ein privater Spitzname. Interne Connector-IDs werden automatisch erzeugt.",
    "Uses the Claude login already on this computer. Nothing to type.": "Verwendet die bereits auf diesem Computer vorhandene Claude-Anmeldung. Nichts einzugeben.",
    "Uses the Codex login already on this computer. Nothing to type.": "Verwendet die bereits auf diesem Computer vorhandene Codex-Anmeldung. Nichts einzugeben.",
    "Opens a sign-in window so you can add a second account. Your current login is left alone.": "Öffnet ein Anmeldefenster, damit Sie ein zweites Konto hinzufügen können. Ihre aktuelle Anmeldung bleibt unverändert.",
    "How much of the weekly limit to hold back. Once this account would drop below it, AI Quota Meter stops suggesting it and points you at another account instead.": "Wie viel vom wöchentlichen Limit zurückgehalten werden soll. Sobald dieses Konto darunter fallen würde, schlägt AI Quota Meter es nicht mehr vor und verweist stattdessen auf ein anderes Konto.",
    "Checking usage is free — the 5-hour and weekly numbers come from Anthropic's own usage endpoint and never spend message quota.": "Die Nutzung zu prüfen ist kostenlos — die 5-Stunden- und Wochenwerte stammen von Anthropics eigenem Nutzungs-Endpunkt und verbrauchen nie Nachrichtenkontingent.",
    "The key is encrypted in your browser and sent only to the local companion, which checks DeepSeek over TLS.": "Der Schlüssel wird in Ihrem Browser verschlüsselt und nur an den lokalen Begleiter gesendet, der DeepSeek über TLS abfragt.",
    "The key is encrypted in your browser and sent only to this loopback companion, which checks DeepSeek over TLS.": "Der Schlüssel wird in Ihrem Browser verschlüsselt und nur an diesen lokalen Loopback-Begleiter gesendet, der DeepSeek über TLS abfragt.",
    "Used only for the official balance endpoint. It is never written to server logs or plaintext storage.": "Wird nur für den offiziellen Guthaben-Endpunkt verwendet. Er wird nie in Server-Logs oder unverschlüsseltem Speicher abgelegt.",
    "Select the DeepSeek amount-*.csv export. It is parsed in this tab; only encrypted aggregates are saved.": "Wählen Sie die DeepSeek-Exportdatei amount-*.csv aus. Sie wird in diesem Tab verarbeitet; nur verschlüsselte Aggregate werden gespeichert.",
    "Select the DeepSeek": "Wählen Sie die DeepSeek-Exportdatei",
    "export. It is parsed in this tab; only encrypted aggregates are saved.": "aus. Sie wird in diesem Tab verarbeitet; nur verschlüsselte Aggregate werden gespeichert.",
    "A sign-in window has opened. Follow the steps in it — this page continues on its own when you're done.": "Ein Anmeldefenster wurde geöffnet. Folgen Sie den Schritten darin — diese Seite macht von selbst weiter, sobald Sie fertig sind.",
    "Paste this into the terminal you use, then come back — this page still picks it up automatically.": "Fügen Sie dies in das von Ihnen verwendete Terminal ein und kommen Sie dann zurück — diese Seite erkennt es trotzdem automatisch.",
    "Sign in to reconnect": "Zum erneuten Verbinden anmelden",
    "Select Open sign-in window below. Follow the steps in the window that opens — this page reconnects on its own when you're done.": "Wählen Sie unten Anmeldefenster öffnen. Folgen Sie den Schritten im sich öffnenden Fenster — diese Seite verbindet sich von selbst neu, sobald Sie fertig sind.",
    "AES-256-GCM vault": "AES-256-GCM-Tresor",
    "PBKDF2-HMAC-SHA256 · 600,000 iterations · manual lock controls": "PBKDF2-HMAC-SHA256 · 600.000 Iterationen · manuelle Sperrsteuerung",
    "No encrypted account profiles yet.": "Noch keine verschlüsselten Kontoprofile.",
    "Match your system, or pin the dashboard to light or dark": "Folgen Sie Ihrem System oder legen Sie das Dashboard fest auf hell oder dunkel",
    "Dashboard cards hide the account identity line entirely—useful when sharing your screen": "Dashboard-Karten blenden die Kontoidentitätszeile vollständig aus — nützlich beim Bildschirmteilen",
    "Safe to store; still requires your passphrase": "Kann sicher gespeichert werden; erfordert weiterhin Ihre Passphrase",
    "Replaces the vault in this browser after confirmation": "Ersetzt den Tresor in diesem Browser nach Bestätigung",
    "Claude/Codex schema-v1 JSON; current tab only": "Claude/Codex-Schema-v1-JSON; nur aktueller Tab",
    "Clears decrypted account data from memory; still requires your passphrase": "Löscht entschlüsselte Kontodaten aus dem Speicher; erfordert weiterhin Ihre Passphrase",
    "Forgets this device—removes the stay-signed-in key so reload asks for your passphrase again": "Vergisst dieses Gerät — entfernt den Angemeldet-bleiben-Schlüssel, sodass beim Neuladen erneut nach Ihrer Passphrase gefragt wird",
    "Removes encrypted data from this browser only": "Entfernt verschlüsselte Daten nur aus diesem Browser",
    "Account secrets are encrypted at rest and never accepted by a public-hosted connector.": "Kontogeheimnisse werden im Ruhezustand verschlüsselt und niemals von einem öffentlich gehosteten Connector akzeptiert.",
    "Build your little AI team": "Stellen Sie Ihr kleines KI-Team zusammen",
    "Add Claude, Codex, or DeepSeek to see every limit in one happy place. Only DeepSeek needs an API key, and the app accepts it only on localhost.": "Fügen Sie Claude, Codex oder DeepSeek hinzu, um alle Limits an einem Ort zu sehen. Nur DeepSeek benötigt einen API-Schlüssel, und die App akzeptiert ihn nur auf localhost.",
    "Reset events appear after a local Claude or Codex connector reports usage.": "Zurücksetzungsereignisse erscheinen, nachdem ein lokaler Claude- oder Codex-Connector Nutzung gemeldet hat.",
    "Deltas compare consecutive refreshes of the same window. Refreshes more than 90 minutes apart start a new session. A window that reset in between counts only the new window's usage.": "Deltas vergleichen aufeinanderfolgende Prüfungen desselben Fensters. Prüfungen, die mehr als 90 Minuten auseinanderliegen, beginnen eine neue Sitzung. Ein Fenster, das dazwischen zurückgesetzt wurde, zählt nur die Nutzung des neuen Fensters.",
    "Loopback verified. Your secrets are encrypted at rest, and every provider check stays between this machine and that provider.": "Loopback verifiziert. Ihre Geheimnisse sind im Ruhezustand verschlüsselt, und jede Anbieterprüfung bleibt zwischen diesem Computer und diesem Anbieter.",
    "Offline mode: the encrypted vault works here. Start the local companion for live DeepSeek credits.": "Offline-Modus: Der verschlüsselte Tresor funktioniert hier. Starten Sie den lokalen Begleiter für Live-DeepSeek-Guthaben.",
    "Hosted mode: API-key connectors are switched off. Run the app locally to connect DeepSeek.": "Gehosteter Modus: API-Schlüssel-Connectors sind deaktiviert. Führen Sie die App lokal aus, um DeepSeek zu verbinden.",
    "Usage over time": "Nutzung im Zeitverlauf",
    "Usage per refresh": "Nutzung pro Prüfung",
    "Usage per refresh, oldest to newest": "Nutzung pro Prüfung, von der ältesten zur neuesten",
    "Charts & data ↗": "Diagramme & Daten ↗",
    "Imported key usage": "Importierte Schlüsselnutzung",
    "No per-key usage imported yet": "Noch keine Nutzung pro Schlüssel importiert",
    "Add DeepSeek’s amount CSV export to see tokens per key": "Fügen Sie DeepSeeks Mengen-CSV-Export hinzu, um Tokens pro Schlüssel zu sehen",
    "No key label": "Keine Schlüsselbezeichnung",
    "local CLI": "lokale CLI",
    "API credits": "API-Guthaben",
    "Check login": "Anmeldung prüfen",
    "Connect to read credits": "Verbinden, um Guthaben zu lesen",
    "Import usage": "Nutzung importieren",
    "Check now": "Jetzt prüfen",
    "No meaningful unused-capacity risk is projected.": "Es wird kein nennenswertes Risiko ungenutzter Kapazität prognostiziert.",
    "no session spend yet": "noch keine Sitzungsausgaben",
    "Credits spent per refresh": "Verbrauchtes Guthaben pro Prüfung",
    "no usage": "keine Nutzung",
    "total": "gesamt",
    "rows": "Zeilen",
    "average": "Durchschnitt",
    "limit in": "Limit in",
    "this session": "diese Sitzung",
    "sessions at your typical": "Sitzungen bei Ihrer üblichen",
    "may go unused": "könnte ungenutzt bleiben",
    "before reset": "vor dem Zurücksetzen",
    "Expected reset; waiting for confirmation": "Zurücksetzung erwartet; wartet auf Bestätigung",
    "verified API key": "verifizierter API-Schlüssel",
    "legacy profile": "Altprofil",
    "CLI identity verified": "CLI-Identität verifiziert",
    "Fictional demo profile": "Fiktives Demoprofil",
    "Unverified legacy profile": "Nicht verifiziertes Altprofil",
    "Never synced": "Nie synchronisiert",
    "Just now": "Gerade eben",
    "rose": "Altrosa", "gold": "Gold", "lime": "Limette", "cyan": "Cyan",
    "sky": "Himmelblau", "indigo": "Indigo", "violet": "Violett", "pink": "Pink",
    "Remove this encrypted account profile from this browser vault? Provider credentials outside this app are not changed.": "Dieses verschlüsselte Kontoprofil aus dem Tresor dieses Browsers entfernen? Anbieteranmeldedaten außerhalb dieser App werden nicht geändert.",
    "Replace the encrypted vault currently stored in this browser? Export it first if needed.": "Den derzeit in diesem Browser gespeicherten verschlüsselten Tresor ersetzen? Exportieren Sie ihn zuvor bei Bedarf.",
    "Permanently remove this encrypted vault from this browser? This cannot be recovered without an exported backup.": "Diesen verschlüsselten Tresor dauerhaft aus diesem Browser entfernen? Ohne exportiertes Backup ist dies nicht wiederherstellbar.",
    "Run AI Quota Meter on localhost to connect subscription accounts.": "Führen Sie AI Quota Meter auf localhost aus, um Abonnementkonten zu verbinden.",
    "The local provider check failed.": "Die lokale Anbieterprüfung ist fehlgeschlagen.",
    "Could not add this account.": "Dieses Konto konnte nicht hinzugefügt werden.",
    "Could not reconnect this account.": "Dieses Konto konnte nicht erneut verbunden werden.",
    "Could not open the sign-in window.": "Das Anmeldefenster konnte nicht geöffnet werden.",
    "Incorrect passphrase or damaged vault.": "Falsche Passphrase oder beschädigter Tresor.",
    "Use a master passphrase of at least 12 characters.": "Verwenden Sie eine Master-Passphrase mit mindestens 12 Zeichen.",
    "The passphrases do not match.": "Die Passphrasen stimmen nicht überein.",
    "Export failed.": "Export fehlgeschlagen.",
    "Import failed.": "Import fehlgeschlagen.",
    "Snapshot import failed.": "Import des Snapshots fehlgeschlagen.",
    "Usage import failed.": "Import der Nutzung fehlgeschlagen.",
    "Enter a name.": "Geben Sie einen Namen ein.",
    "Could not save this name.": "Dieser Name konnte nicht gespeichert werden.",
    "Copy failed. Select the command text and copy it manually.": "Kopieren fehlgeschlagen. Wählen Sie den Befehlstext aus und kopieren Sie ihn manuell.",
    "DeepSeek keys are accepted only by the loopback-local app.": "DeepSeek-Schlüssel werden nur von der lokalen Loopback-App akzeptiert.",
    "DeepSeek rejected this API key.": "DeepSeek hat diesen API-Schlüssel abgelehnt.",
    "Could not read DeepSeek balance.": "DeepSeek-Guthaben konnte nicht gelesen werden.",
    "Local account setup is available only through the loopback app.": "Die lokale Kontoeinrichtung ist nur über die Loopback-App verfügbar.",
    "Opening a sign-in terminal is available only through the loopback app.": "Das Öffnen eines Anmeldeterminals ist nur über die Loopback-App verfügbar.",
    "Could not open a sign-in terminal for this profile.": "Für dieses Profil konnte kein Anmeldeterminal geöffnet werden.",
    "Claude connection is available only through the loopback app.": "Die Claude-Verbindung ist nur über die Loopback-App verfügbar.",
    "Claude usage sync is available only through the loopback app.": "Die Claude-Nutzungssynchronisierung ist nur über die Loopback-App verfügbar.",
    "Codex connection is available only through the loopback app.": "Die Codex-Verbindung ist nur über die Loopback-App verfügbar.",
    "Could not inspect the local Claude Code account. Confirm that Claude Code is installed.": "Das lokale Claude-Code-Konto konnte nicht geprüft werden. Stellen Sie sicher, dass Claude Code installiert ist.",
    "Could not inspect the local Codex account. Confirm that Codex CLI is installed.": "Das lokale Codex-Konto konnte nicht geprüft werden. Stellen Sie sicher, dass Codex CLI installiert ist.",
    "Usage data unavailable": "Nutzungsdaten nicht verfügbar",
  }),
});

function aiQuotaArabicCount(number, forms) {
  const category = new Intl.PluralRules("ar").select(number);
  if (category === "zero") return forms.zero;
  if (category === "one") return forms.one;
  if (category === "two") return forms.two;
  return `${number} ${category === "few" ? forms.few : forms.other}`;
}

// French treats 0 and 1 as the "one" category (CLDR), German only 1. Neither
// language needs Arabic's zero/two/few/many split — Intl.PluralRules never
// returns those categories for fr/de — so one shared two-form helper covers
// both, unlike Arabic's dedicated six-category one above.
function aiQuotaCount(locale, number, forms) {
  const category = new Intl.PluralRules(locale).select(number);
  return `${number} ${forms[category] ?? forms.other}`;
}

const AI_QUOTA_PATTERNS = Object.freeze({
  ar: [
    [/^Checked (.+)$/, "آخر تحقق: $1"],
    [/^(.+) ago$/, "منذ $1"],
    [/^Refills in (.+)$/, "يتجدد خلال $1"],
    [/^(.+) left$/, "$1 متبقٍ"],
    [/^(.+) may go unused$/, "قد لا يُستخدم $1"],
    [/^Since last refresh · (.+) earlier$/, "منذ آخر تحقق · قبل $1"],
    [/^(\d+) refreshes$/, "$1 عمليات تحقق"],
    [/^(\d+) readings$/, "$1 قراءات"],
    [/^(\d+) rows$/, "$1 صفوف"],
    [/^(\d+) total$/, "$1 إجمالًا"],
    [/^(.+)\/h average$/, "متوسط $1/س"],
    [/^limit in (.+)$/, "الحد خلال $1"],
    [/^No (.+) accounts yet$/, "لا توجد حسابات $1 بعد"],
    [/^Charts and data for (.+)$/, "الرسوم والبيانات لـ $1"],
    [/^Check (.+) now$/, "تحقق من $1 الآن"],
    [/^Edit (.+)$/, "تعديل $1"],
    [/^Import usage for (.+)$/, "استيراد استخدام $1"],
    [/^(.+) remaining$/, "$1 متبقٍ"],
    [/^Show (.+)$/, "إظهار $1"],
    [/^Hide (.+)$/, "إخفاء $1"],
    [/^Waiting for you to sign in to (.+)$/, "بانتظار تسجيل دخولك إلى $1"],
    [/^Signed in as (.+)\. Reading your limits…$/, "تم تسجيل الدخول باسم $1. جارٍ قراءة حدودك…"],
    [/^Refreshing (.+)…$/, "جارٍ تحديث $1…"],
    [/^(.+) balance refreshed\.$/, "تم تحديث رصيد $1."],
    [/^(.+) is reconnected\.$/, "أُعيد ربط $1."],
    [/^(.+) usage imported locally from (.+)\.$/, "تم استيراد استخدام $1 محليًا من $2."],
    [/^(.+) · (\d+) check-ins? kept on this device$/, "$1 · $2 من عمليات التحقق محفوظة على هذا الجهاز"],
  ],
  fr: [
    [/^Checked (.+)$/, "Vérifié $1"],
    [/^(.+) ago$/, "il y a $1"],
    [/^Refills in (.+)$/, "Se recharge dans $1"],
    [/^(.+) left$/, "$1 restant"],
    [/^(.+) may go unused$/, "$1 risque de ne pas être utilisé"],
    [/^Since last refresh · (.+) earlier$/, "Depuis la dernière vérification · il y a $1"],
    [/^(\d+) refreshes$/, (_, n) => aiQuotaCount("fr", Number(n), { one: "actualisation", other: "actualisations" })],
    [/^(\d+) readings$/, (_, n) => aiQuotaCount("fr", Number(n), { one: "lecture", other: "lectures" })],
    [/^(\d+) rows$/, (_, n) => aiQuotaCount("fr", Number(n), { one: "ligne", other: "lignes" })],
    [/^(\d+) total$/, "$1 au total"],
    [/^(.+)\/h average$/, "moyenne $1/h"],
    [/^limit in (.+)$/, "limite dans $1"],
    [/^No (.+) accounts yet$/, "Aucun compte $1 pour le moment"],
    [/^Charts and data for (.+)$/, "Graphiques et données pour $1"],
    [/^Check (.+) now$/, "Vérifier $1 maintenant"],
    [/^Edit (.+)$/, "Modifier $1"],
    [/^Import usage for (.+)$/, "Importer l’utilisation pour $1"],
    [/^(.+) remaining$/, "$1 restant"],
    [/^Show (.+)$/, "Afficher $1"],
    [/^Hide (.+)$/, "Masquer $1"],
    [/^Waiting for you to sign in to (.+)$/, "En attente de votre connexion à $1"],
    [/^Signed in as (.+)\. Reading your limits…$/, "Connecté en tant que $1. Lecture de vos limites…"],
    [/^Refreshing (.+)…$/, "Actualisation de $1…"],
    [/^(.+) balance refreshed\.$/, "Solde $1 actualisé."],
    [/^(.+) is reconnected\.$/, "$1 est reconnecté."],
    [/^(.+) usage imported locally from (.+)\.$/, "Utilisation $1 importée localement depuis $2."],
    [/^(.+) · (\d+) check-ins? kept on this device$/, (_, a, n) => `${a} · ${aiQuotaCount("fr", Number(n), { one: "vérification conservée", other: "vérifications conservées" })} sur cet appareil`],
  ],
  de: [
    [/^Checked (.+)$/, "Geprüft $1"],
    [/^(.+) ago$/, "vor $1"],
    [/^Refills in (.+)$/, "Lädt auf in $1"],
    [/^(.+) left$/, "$1 übrig"],
    [/^(.+) may go unused$/, "$1 könnte ungenutzt bleiben"],
    [/^Since last refresh · (.+) earlier$/, "Seit der letzten Prüfung · vor $1"],
    [/^(\d+) refreshes$/, (_, n) => aiQuotaCount("de", Number(n), { one: "Aktualisierung", other: "Aktualisierungen" })],
    [/^(\d+) readings$/, (_, n) => aiQuotaCount("de", Number(n), { one: "Messwert", other: "Messwerte" })],
    [/^(\d+) rows$/, (_, n) => aiQuotaCount("de", Number(n), { one: "Zeile", other: "Zeilen" })],
    [/^(\d+) total$/, "$1 insgesamt"],
    [/^(.+)\/h average$/, "Durchschnitt $1/Std"],
    [/^limit in (.+)$/, "Limit in $1"],
    [/^No (.+) accounts yet$/, "Noch keine $1-Konten"],
    [/^Charts and data for (.+)$/, "Diagramme und Daten für $1"],
    [/^Check (.+) now$/, "$1 jetzt prüfen"],
    [/^Edit (.+)$/, "$1 bearbeiten"],
    [/^Import usage for (.+)$/, "Nutzung für $1 importieren"],
    [/^(.+) remaining$/, "$1 verbleibend"],
    [/^Show (.+)$/, "$1 anzeigen"],
    [/^Hide (.+)$/, "$1 verbergen"],
    [/^Waiting for you to sign in to (.+)$/, "Warten auf Ihre Anmeldung bei $1"],
    [/^Signed in as (.+)\. Reading your limits…$/, "Angemeldet als $1. Ihre Limits werden gelesen…"],
    [/^Refreshing (.+)…$/, "$1 wird aktualisiert…"],
    [/^(.+) balance refreshed\.$/, "$1-Guthaben aktualisiert."],
    [/^(.+) is reconnected\.$/, "$1 ist wieder verbunden."],
    [/^(.+) usage imported locally from (.+)\.$/, "$1-Nutzung lokal aus $2 importiert."],
    [/^(.+) · (\d+) check-ins? kept on this device$/, (_, a, n) => `${a} · ${aiQuotaCount("de", Number(n), { one: "Prüfung", other: "Prüfungen" })} auf diesem Gerät gespeichert`],
  ],
});

const AI_QUOTA_FRAGMENTS = Object.freeze({
  ar: [
    ["Weekly", "أسبوعي"], ["5-hour", "5 ساعات"], ["ready to go", "جاهز للاستخدام"],
    ["RUNNING LOW", "الرصيد منخفض"], ["READY TO GO", "جاهز للاستخدام"], ["SESSION ACTIVE", "جلسة نشطة"],
    ["Credits available", "الرصيد المتاح"], ["Granted", "ممنوح"], ["Topped up", "مشحون"],
    ["requests", "طلبات"], ["tokens", "رموز"], ["refreshes", "عمليات تحقق"], ["readings", "قراءات"],
    ["Session active", "جلسة نشطة"], ["Idle", "خامل"], ["Charts & data", "الرسوم والبيانات"],
    ["Imported key usage", "استخدام المفاتيح المستورد"], ["keys", "مفاتيح"], ["key", "مفتاح"],
    ["this session", "هذه الجلسة"], ["last session", "الجلسة السابقة"], ["more sessions at your typical", "جلسات إضافية بمعدلك المعتاد"],
    ["since the previous refresh", "منذ التحقق السابق"],
    ["since previous", "منذ السابق"], ["holds back", "يحتفظ بـ"], ["weekly", "أسبوعيًا"],
    ["recorded usage in the last", "سجلت استخدامًا خلال آخر"], ["peak", "الذروة"], ["credits", "رصيد"],
    ["used", "مستخدَم"],
    ["local CLI", "CLI محلي"], ["API credits", "رصيد API"], ["currencies", "عملات"], ["currency", "عملة"],
    ["projected unused", "متوقع ألا يُستخدم"], ["potentially unused", "قد لا يُستخدم"], ["gap", "فاصل"],
    ["previous", "السابق"], ["left before reset", "متبقٍ قبل إعادة التعيين"], ["at reset", "عند إعادة التعيين"],
  ],
  fr: [
    ["Weekly", "Hebdomadaire"], ["5-hour", "5 heures"], ["ready to go", "prêt à l’emploi"],
    ["RUNNING LOW", "RÉSERVE FAIBLE"], ["READY TO GO", "PRÊT À L’EMPLOI"], ["SESSION ACTIVE", "SESSION ACTIVE"],
    ["Credits available", "Crédits disponibles"], ["Granted", "Accordés"], ["Topped up", "Rechargés"],
    ["requests", "requêtes"], ["tokens", "jetons"], ["refreshes", "actualisations"], ["readings", "lectures"],
    ["Session active", "Session active"], ["Idle", "Inactif"], ["Charts & data", "Graphiques et données"],
    ["Imported key usage", "Utilisation importée par clé"], ["keys", "clés"], ["key", "clé"],
    ["this session", "cette session"], ["last session", "session précédente"], ["more sessions at your typical", "sessions supplémentaires à votre rythme habituel"],
    ["since the previous refresh", "depuis la vérification précédente"],
    ["since previous", "depuis la précédente"], ["holds back", "conserve"], ["weekly", "hebdomadaire"],
    ["recorded usage in the last", "a enregistré une utilisation au cours des dernières"], ["peak", "pic"], ["credits", "crédits"],
    ["used", "utilisé"],
    ["local CLI", "CLI locale"], ["API credits", "Crédits API"], ["currencies", "devises"], ["currency", "devise"],
    ["projected unused", "projeté comme inutilisé"], ["potentially unused", "potentiellement inutilisé"], ["gap", "écart"],
    ["previous", "précédent"], ["left before reset", "restant avant réinitialisation"], ["at reset", "à la réinitialisation"],
  ],
  de: [
    ["Weekly", "Wöchentlich"], ["5-hour", "5 Stunden"], ["ready to go", "einsatzbereit"],
    ["RUNNING LOW", "RESERVE NIEDRIG"], ["READY TO GO", "EINSATZBEREIT"], ["SESSION ACTIVE", "SITZUNG AKTIV"],
    ["Credits available", "Verfügbares Guthaben"], ["Granted", "Gewährt"], ["Topped up", "Aufgeladen"],
    ["requests", "Anfragen"], ["tokens", "Tokens"], ["refreshes", "Aktualisierungen"], ["readings", "Messwerte"],
    ["Session active", "Sitzung aktiv"], ["Idle", "Inaktiv"], ["Charts & data", "Diagramme & Daten"],
    ["Imported key usage", "Importierte Schlüsselnutzung"], ["keys", "Schlüssel"], ["key", "Schlüssel"],
    ["this session", "diese Sitzung"], ["last session", "letzte Sitzung"], ["more sessions at your typical", "weitere Sitzungen bei Ihrer üblichen"],
    ["since the previous refresh", "seit der vorherigen Prüfung"],
    ["since previous", "seit vorheriger"], ["holds back", "hält zurück"], ["weekly", "wöchentlich"],
    ["recorded usage in the last", "hat Nutzung in den letzten"], ["peak", "Spitzenwert"], ["credits", "Guthaben"],
    ["used", "genutzt"],
    ["local CLI", "lokale CLI"], ["API credits", "API-Guthaben"], ["currencies", "Währungen"], ["currency", "Währung"],
    ["projected unused", "voraussichtlich ungenutzt"], ["potentially unused", "möglicherweise ungenutzt"], ["gap", "Abstand"],
    ["previous", "vorherige"], ["left before reset", "übrig vor Zurücksetzung"], ["at reset", "bei Zurücksetzung"],
  ],
});

// Two always-applied anchored replacements per locale, kept separate from the
// break-on-first-match list above because both can independently apply.
const AI_QUOTA_EXTRA_PATTERNS = Object.freeze({
  ar: [
    [/^(\d+) tracked refreshes$/, "$1 عمليات تحقق متتبعة"],
    [/^about (.+) projected unused at reset$/, "نحو $1 متوقع ألا يُستخدم عند إعادة التعيين"],
  ],
  fr: [
    [/^(\d+) tracked refreshes$/, (_, n) => aiQuotaCount("fr", Number(n), { one: "actualisation suivie", other: "actualisations suivies" })],
    [/^about (.+) projected unused at reset$/, "environ $1 projeté comme inutilisé à la réinitialisation"],
  ],
  de: [
    [/^(\d+) tracked refreshes$/, (_, n) => aiQuotaCount("de", Number(n), { one: "verfolgte Aktualisierung", other: "verfolgte Aktualisierungen" })],
    [/^about (.+) projected unused at reset$/, "etwa $1 voraussichtlich ungenutzt bei Zurücksetzung"],
  ],
});

// The four counted nouns that appear embedded inside larger strings (not just
// as a whole string, which AI_QUOTA_PATTERNS already covers above).
const AI_QUOTA_COUNT_WORDS = Object.freeze({
  ar: {
    readings: { zero: "لا قراءات", one: "قراءة واحدة", two: "قراءتان", few: "قراءات", other: "قراءة" },
    refreshes: { zero: "لا عمليات تحقق", one: "عملية تحقق واحدة", two: "عمليتا تحقق", few: "عمليات تحقق", other: "عملية تحقق" },
    requests: { zero: "لا طلبات", one: "طلب واحد", two: "طلبان", few: "طلبات", other: "طلبًا" },
    keys: { zero: "لا مفاتيح", one: "مفتاح واحد", two: "مفتاحان", few: "مفاتيح", other: "مفتاحًا" },
  },
  fr: {
    readings: { one: "lecture", other: "lectures" },
    refreshes: { one: "actualisation", other: "actualisations" },
    requests: { one: "requête", other: "requêtes" },
    keys: { one: "clé", other: "clés" },
  },
  de: {
    readings: { one: "Messwert", other: "Messwerte" },
    refreshes: { one: "Aktualisierung", other: "Aktualisierungen" },
    requests: { one: "Anfrage", other: "Anfragen" },
    keys: { one: "Schlüssel", other: "Schlüssel" },
  },
});

// "5m ago" / "1h 30m" / "3d" time fragments produced by observedAge()/
// formatHours() in app.js. Order matters: longer compound forms first.
const AI_QUOTA_TIME_PATTERNS = Object.freeze({
  ar: [
    [/(\d+)m ago/g, "منذ $1 د"], [/(\d+)h ago/g, "منذ $1 س"], [/(\d+)d ago/g, "منذ $1 ي"],
    [/(\d+)h (\d+)m/g, "$1 س $2 د"], [/(\d+)m/g, "$1 د"], [/(\d+)h/g, "$1 س"], [/(\d+)d/g, "$1 ي"],
  ],
  fr: [
    [/(\d+)m ago/g, "il y a $1 min"], [/(\d+)h ago/g, "il y a $1 h"], [/(\d+)d ago/g, "il y a $1 j"],
    [/(\d+)h (\d+)m/g, "$1 h $2 min"], [/(\d+)m/g, "$1 min"], [/(\d+)h/g, "$1 h"], [/(\d+)d/g, "$1 j"],
  ],
  de: [
    [/(\d+)m ago/g, "vor $1 Min"], [/(\d+)h ago/g, "vor $1 Std"], [/(\d+)d ago/g, "vor $1 Tg"],
    [/(\d+)h (\d+)m/g, "$1 Std $2 Min"], [/(\d+)m/g, "$1 Min"], [/(\d+)h/g, "$1 Std"], [/(\d+)d/g, "$1 Tg"],
  ],
});

export function formatAiQuotaMessage(message, params = {}) {
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}

export function validateAiQuotaCatalogs(catalogs) {
  const reference = Object.keys(catalogs.en).sort();
  const errors = [];
  for (const [locale, catalog] of Object.entries(catalogs)) {
    const keys = Object.keys(catalog).sort();
    const missing = reference.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !reference.includes(key));
    if (missing.length) errors.push(`${locale} missing: ${missing.join(", ")}`);
    if (extra.length) errors.push(`${locale} extra: ${extra.join(", ")}`);
    for (const key of reference.filter((candidate) => candidate in catalog)) {
      const params = (value) => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort().join(",");
      if (params(catalogs.en[key]) !== params(catalog[key])) errors.push(`${locale} parameters differ: ${key}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return true;
}

export function createAiQuotaLocalization(catalogs) {
  const supported = Object.freeze({
    en: { direction: "ltr", format: "en-US" },
    ar: { direction: "rtl", format: "ar-EG-u-nu-latn-ca-gregory" },
    fr: { direction: "ltr", format: "fr-FR" },
    de: { direction: "ltr", format: "de-DE" },
  });
  const announcements = Object.freeze({
    en: "Language changed to English",
    ar: "تم تغيير اللغة إلى العربية",
    fr: "Langue changée en français",
    de: "Sprache auf Deutsch geändert",
  });
  const reverseEnglish = new Map(Object.entries(catalogs.en).map(([key, value]) => [value, key]));
  let locale = supported[document.documentElement.lang] ? document.documentElement.lang : "en";
  const textOriginal = new WeakMap();
  const textRendered = new WeakMap();
  const textRenderedLocale = new WeakMap();
  const attributeOriginal = new WeakMap();
  const attributeRendered = new WeakMap();
  const attributeRenderedLocale = new WeakMap();
  let observer;

  validateAiQuotaCatalogs(catalogs);
  const t = (key, params) => formatAiQuotaMessage(catalogs[locale]?.[key] ?? catalogs.en[key] ?? key, params);
  const translateCore = (source) => {
    if (locale === "en" || !source) return source;
    const key = reverseEnglish.get(source);
    if (key && catalogs[locale]?.[key]) return catalogs[locale][key];
    const exact = AI_QUOTA_EXACT[locale]?.[source];
    if (exact) return exact;
    let result = source;
    for (const [pattern, replacement] of AI_QUOTA_PATTERNS[locale] ?? []) {
      if (pattern.test(result)) { result = result.replace(pattern, replacement); break; }
    }
    for (const [pattern, replacement] of AI_QUOTA_EXTRA_PATTERNS[locale] ?? []) {
      result = result.replace(pattern, replacement);
    }
    const counts = AI_QUOTA_COUNT_WORDS[locale] ?? {};
    const countFn = locale === "ar"
      ? (forms) => (value) => aiQuotaArabicCount(Number(value), forms)
      : (forms) => (value) => aiQuotaCount(locale, Number(value), forms);
    if (counts.readings) result = result.replace(/\b(\d+) readings\b/g, (_, value) => countFn(counts.readings)(value));
    if (counts.refreshes) result = result.replace(/\b(\d+) refreshes\b/g, (_, value) => countFn(counts.refreshes)(value));
    if (counts.requests) result = result.replace(/\b(\d+) requests\b/g, (_, value) => countFn(counts.requests)(value));
    if (counts.keys) result = result.replace(/\b(\d+) keys\b/g, (_, value) => countFn(counts.keys)(value));
    for (const [from, to] of AI_QUOTA_FRAGMENTS[locale] ?? []) {
      const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = /^[A-Za-z ]+$/.test(from) ? result.replace(new RegExp(`\\b${escaped}\\b`, "g"), to) : result.replaceAll(from, to);
    }
    for (const [pattern, replacement] of AI_QUOTA_TIME_PATTERNS[locale] ?? []) {
      result = result.replace(pattern, replacement);
    }
    return result;
  };

  function translateTextNode(node) {
    if (!node.parentElement || node.parentElement.closest("script, style, code, [data-i18n-skip]")) return;
    const current = node.nodeValue;
    if (current === textRendered.get(node) && textRenderedLocale.get(node) === locale) return;
    if (locale === "en") {
      const original = textOriginal.get(node);
      if (original !== undefined && current !== original) node.nodeValue = original;
      textRendered.set(node, original ?? current);
      textRenderedLocale.set(node, locale);
      return;
    }
    // `current` is only safe to treat as the English source the first time
    // this node is ever translated (textOriginal has no entry yet, meaning
    // it's still showing the pristine server-rendered/template English).
    // Once a cached original exists, always translate FROM that cached
    // value, never from `current` — `current` could be the PREVIOUS
    // non-English locale's rendered text (e.g. this node still shows
    // Arabic and we're switching straight to German, with English never
    // back on screen in between), and no rule table can translate Arabic
    // into German. Re-using `current` as the source in that case used to
    // both fail the translation and permanently overwrite the true English
    // original with the stale non-English text, corrupting every later
    // switch for this node too — not just this one.
    const original = textOriginal.has(node) ? textOriginal.get(node) : current;
    textOriginal.set(node, original);
    const leading = original.match(/^\s*/)?.[0] ?? "";
    const trailing = original.match(/\s*$/)?.[0] ?? "";
    const core = original.slice(leading.length, original.length - trailing.length);
    const translated = `${leading}${translateCore(core)}${trailing}`;
    if (translated !== current) node.nodeValue = translated;
    textRendered.set(node, translated);
    textRenderedLocale.set(node, locale);
  }

  const translatedAttributes = ["aria-label", "aria-valuetext", "title", "placeholder", "alt"];
  function translateElementAttributes(element) {
    if (element.closest("[data-i18n-skip]")) return;
    let originals = attributeOriginal.get(element);
    let rendered = attributeRendered.get(element);
    if (!originals) { originals = new Map(); attributeOriginal.set(element, originals); }
    if (!rendered) { rendered = new Map(); attributeRendered.set(element, rendered); }
    for (const name of translatedAttributes) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      if (current === rendered.get(name) && attributeRenderedLocale.get(element) === locale) continue;
      if (locale === "en") {
        const original = originals.get(name);
        if (original !== undefined && current !== original) element.setAttribute(name, original);
        rendered.set(name, original ?? current);
      } else {
        // Same fix as translateTextNode above: prefer the already-cached
        // original over `current`, which may be the previous non-English
        // locale's rendered value rather than English.
        const original = originals.has(name) ? originals.get(name) : current;
        originals.set(name, original);
        const translated = translateCore(original);
        if (translated !== current) element.setAttribute(name, translated);
        rendered.set(name, translated);
      }
    }
    attributeRenderedLocale.set(element, locale);
  }

  function apply(root = document) {
    const element = root.nodeType === Node.ELEMENT_NODE ? root : root.documentElement;
    translateElementAttributes(element);
    element.querySelectorAll("*").forEach(translateElementAttributes);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateTextNode(walker.currentNode);
  }

  function setLocale(next, options = {}) {
    if (!supported[next]) next = "en";
    locale = next;
    document.documentElement.lang = next;
    document.documentElement.dir = supported[next].direction;
    if (options.persist !== false) {
      try { localStorage.setItem(AI_QUOTA_LANGUAGE_STORAGE_KEY, next); } catch { /* In-session switching still works. */ }
    }
    document.querySelectorAll(".language-select").forEach((select) => { select.value = next; });
    apply();
    document.dispatchEvent(new CustomEvent("aiquotelanguagechange", { detail: { locale: next } }));
  }

  function observe() {
    observer?.disconnect();
    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") translateTextNode(record.target);
        else if (record.type === "attributes") translateElementAttributes(record.target);
        else for (const node of record.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) apply(node);
        }
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: translatedAttributes });
  }

  const formatLocale = () => supported[locale].format;
  return Object.freeze({
    t, apply, observe, setLocale, get locale() { return locale; }, get direction() { return supported[locale].direction; },
    announcement: (next) => announcements[next] ?? announcements.en,
    number: (value, options = {}) => new Intl.NumberFormat(formatLocale(), { numberingSystem: "latn", ...options }).format(value),
    date: (value, options = {}) => new Intl.DateTimeFormat(formatLocale(), { calendar: "gregory", numberingSystem: "latn", ...options }).format(value),
    translate: translateCore,
  });
}
