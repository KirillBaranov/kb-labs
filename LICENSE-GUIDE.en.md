# KB Public License v1.1 — User Guide

> 📄 **Legal license text**: [LICENSE-KB-PUBLIC](LICENSE-KB-PUBLIC)
> 💬 **This guide**: Friendly explanations and examples
> 🇷🇺 **Русская версия**: [LICENSE-GUIDE.ru.md](LICENSE-GUIDE.ru.md)

This is a plain-language guide to help you understand the KB Public License v1.1. **The legal license text takes precedence** — this guide is for clarification only.

---

## 🎯 TL;DR (Quick Summary)

### ✅ What you CAN do (free):
- Use KB Labs for **internal company use** (any size, unlimited employees)
- Self-host on your own infrastructure
- Modify and create plugins
- Build open source projects
- Work on client projects using KB Labs

### ❌ What you CANNOT do (without commercial license):
- Offer KB Labs as a **hosted service** (SaaS/PaaS) to other companies
- Create a **competing platform** product
- White-label and resell KB Labs
- Remove the license or copyright notices

### 💰 Need commercial license?
Contact: **contact@kblabs.dev**

---

## 📖 Section-by-Section Guide

### 1. Permitted Use — Что разрешено

**Legal text says:**
> You may use the software for personal, educational, research, and commercial projects, modify it, self-host it, and use internally within your organization.

**What this means:**

✅ **Your company can use KB Labs freely for internal purposes**
- Install on your servers
- Use by your developers/teams
- Any company size (startup to enterprise)
- Unlimited employees
- Modify for your needs
- Create custom plugins

✅ **You can use KB Labs while working with clients**
- Agency uses KB Labs to audit client code ✓
- Consultancy uses KB Labs on client projects ✓
- Your developers use it for client work ✓

✅ **You can contribute back**
- Make open source forks
- Share improvements
- Build plugins for the community

**Key principle:** If KB Labs runs for **your team's benefit** → it's free to use.

---

### 2. Restrictions — Что запрещено

#### ❌ HOSTED SERVICES (без разрешения запрещено)

**Legal text says:**
> You may NOT offer the software as a hosted service where third-party users access KB Labs functionality through your infrastructure.

**What this means:**

| Scenario | Allowed? | Why? |
|----------|----------|------|
| Your startup installs KB Labs for 50 devs | ✅ YES | Internal use |
| Your agency uses KB Labs to work on client projects | ✅ YES | Your employees use it |
| Your enterprise runs KB Labs for 5,000 employees | ✅ YES | Internal use |
| You offer "KB Labs Cloud" for $50/month per user | ❌ NO | Hosted service for others |
| You provide free KB Labs hosting to attract users | ❌ NO | Hosted service |
| You expose KB Labs via your API for customers | ❌ NO | Service to third parties |

**The key distinction:**

```
INTERNAL USE (✅ allowed):
Your company → Your servers → Your employees → Work with clients

HOSTED SERVICE (❌ not allowed):
Your company → Your servers → Other companies' employees → They pay you
```

**Real-world examples:**

**✅ Allowed:**
- **DevShop Agency**: Installs KB Labs on their servers. Their 20 developers use it to analyze client codebases and deliver consulting services. Clients never log into KB Labs. **→ This is internal use, perfectly fine!**

- **Enterprise Corp**: Runs KB Labs on-prem for 2,000 engineers across 10 teams. Engineers use it for daily development work. **→ Internal use, no problem!**

**❌ Not allowed (needs commercial license):**
- **CloudCo**: Offers "KB Labs as a Service" where other companies sign up, create accounts, and use KB Labs through CloudCo's infrastructure. **→ This is a hosted service, needs license!**

- **DevPlatform Inc**: Includes KB Labs in their developer platform that they sell to enterprises. Customers access KB Labs features through DevPlatform's product. **→ Hosted service/resale, needs license!**

---

#### ❌ COMPETING PRODUCTS

**Legal text says:**
> You may NOT create or sell a product that replicates KB Labs core value proposition as an integrated platform.

**What this means:**

KB Labs is defined by the combination of:
1. **AI-powered code search** (Mind Engine) +
2. **Plugin system** (Plugin Runtime) +
3. **Workflow orchestration**

**❌ COMPETING (needs commercial license):**

- **"DevPlatform Pro"** — You fork KB Labs, rebrand the UI, and sell it as "your platform"
  - → This is a clone, you're competing with us

- **"CodeAI Platform"** — You build a product using all three KB Labs components (Mind + Plugins + Workflows) as the foundation
  - → You're replicating our integrated platform

- **White-label KB Labs** — You rebrand KB Labs and resell to enterprises
  - → Direct competition

**✅ NOT COMPETING (allowed):**

- **"SearchMyCode"** — You use only Mind Engine to add code search to your existing DevOps tool
  - → Different product, different purpose, using one component

- **"PluginRunner"** — You build a generic plugin system inspired by KB Labs architecture
  - → Inspiration is fine, you're not using our code as foundation

- **"MyDevTool"** — You integrate Mind Engine with your proprietary CI/CD platform
  - → You're building something different, just using one KB Labs component

- **Internal tool** — Your company builds an internal developer portal using KB Labs components
  - → Internal use, not a product you sell

**Rule of thumb:**

> If someone looks at your product and says **"this is basically KB Labs with a different logo"** → you're competing.
>
> If they say **"this is a different product that happens to use some KB Labs technology"** → you're fine.

**Why this matters:**

We want to protect the **integrated platform** from clones, but we're **happy** for people to use individual components (like Mind Engine) in creative ways. Use our tech, just don't clone the whole platform.

---

### 3. Source Code Visibility — Открытость кода

**Legal text says:**
> If you distribute modified versions publicly, you must disclose modifications, include this license, and document changes.

**What this means:**

If you make a **public fork** of KB Labs:
- ✅ Add note: "Based on KB Labs by KB Labs"
- ✅ Keep the LICENSE file
- ✅ Add CHANGELOG describing your changes

This doesn't apply to:
- ❌ Internal modifications (you don't distribute publicly)
- ❌ Custom plugins (they're extensions, not modifications)

---

### 4. No Warranty — Отказ от гарантий

**Legal text says:**
> Software is provided "as is" without warranty. KB Labs is not liable for damages.

**What this means:**

Standard open source disclaimer:
- We provide the code, but can't guarantee it won't break
- If KB Labs causes issues in your production → we're not financially liable
- You use it at your own risk

This is standard in 99% of open source licenses (MIT, Apache, GPL all have this).

---

### 5. Commercial License — Коммерческая лицензия

**Legal text says:**
> Organizations that want to offer hosted versions, compete, or bundle into proprietary systems must obtain a commercial license.

**What this means:**

If you fall into the "NOT ALLOWED" category → contact us!

**contact@kblabs.dev**

We're reasonable people and open to discussions. Commercial licenses are negotiated case-by-case based on:
- Your use case
- Company size
- Revenue model

We want to find terms that work for both of us.

---

### 6. Definitions — Detailed Clarifications

See Sections 6.1 and 6.2 in the [license](LICENSE-KB-PUBLIC) for precise legal definitions of:
- **"Competing Product"**
- **"Hosted Service"**

Includes specific examples and exceptions.

---

### 7. Governing Law — Юрисдикция

**Legal text says:**
> Governed by laws of Russian Federation, disputes resolved in courts of Moscow, Russia.

**What this means:**

If there's a legal dispute about this license:
- **Applicable law**: Russian Federation law
- **Courts**: Moscow, Russia

This just sets the legal framework. Most users will never need to think about this.

---

### 8. License Termination — Что если нарушил?

**Legal text says:**
> License terminates if you violate terms. You get 30 days to cure minor violations.

**What this means:**

**If you accidentally violate the license:**

1. **We send you a notice** describing the violation
2. **You have 30 days** to fix it (e.g., shut down SaaS, get commercial license)
3. **If you fix it** → license automatically reinstated, no problem!
4. **If you don't fix it** → license permanently terminates for you

**For serious violations**, we can:
- Get court order to stop your use
- Seek monetary damages
- Recover profits you made from violation

**Don't panic:** This is standard legal protection. The key is the **30-day cure period** — if you accidentally mess up, you have time to make it right.

---

### 9. Contributions — Contributor License Agreement (CLA)

**Legal text says:**
> By contributing code, you grant KB Labs rights to use it in open source and commercial versions.

**What this means:**

If you submit a **pull request** to KB Labs:

✅ **You give us permission to:**
- Include your code in the open source version (under this license)
- Include your code in potential future commercial products
- We don't pay you royalties (but we credit you in git history!)

✅ **You confirm:**
- It's your code (or you have rights to contribute it)
- No copyright violations
- No patent issues

✅ **To confirm, write in your PR:**
```
I accept the KB Labs CLA as described in LICENSE section 9
```

**Why we need this:**

Without a CLA, we can't safely use your contributions. Someone could contribute code, then later demand we remove it or pay royalties. This protects both you and us.

**Standard practice:** Google, Microsoft, Apache Foundation, Linux Foundation — all have CLAs.

**Your rights:** You still own your code! You can use it anywhere. We just get rights to use it too.

---

### 10. License Updates — Обновления

**Legal text says:**
> KB Labs may publish new license versions. You can stay on the version you originally received.

**What this means:**

**If we release v1.2 or v2.0:**
- You can **keep using KB Labs under v1.1** (the version you have now)
- OR you can **upgrade** to the new license version

**Exception:** If we release a **new major version** of KB Labs software (e.g., KB Labs 3.0) and say it requires license v2.0, then to use the new software version, you'd need to accept v2.0.

**Old versions of KB Labs always available under old license.**

---

### 11. Contact — Вопросы

**Email:** contact@kblabs.dev

**Not sure if your use case is allowed?** → Ask us! Better to clarify upfront than accidentally violate the license.

We're approachable and pragmatic. We want KB Labs to be widely used, while protecting against people who would clone our platform for profit.

---

## 🧭 Decision Tree: Do I Need a Commercial License?

```
┌─────────────────────────────────────────┐
│ How will you use KB Labs?               │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
    Internal use        Offering to others?
    (your team)             │
        │               ┌───┴────┐
        ✅              │        │
     FREE!          Hosted   Selling
                    service?  product?
                        │        │
                       ❌       ❌
                    Need      Need
                   license   license
```

**Questions to ask yourself:**

1. **Who runs KB Labs?**
   - ✅ My company's servers for my team → Free
   - ❌ My servers, but customers access it → Need license

2. **Who benefits?**
   - ✅ My employees use it for their work → Free
   - ❌ Other companies pay to use it → Need license

3. **What am I building?**
   - ✅ Internal tool, plugins, extensions → Free
   - ✅ Product that uses one KB Labs component → Free
   - ❌ Clone of KB Labs platform → Need license

---

## 📊 Common Scenarios

| Scenario | License Needed? | Explanation |
|----------|----------------|-------------|
| **Startup with 10 devs** uses KB Labs on AWS for internal development | ❌ No | Internal use |
| **Enterprise** installs KB Labs on-prem for 5,000 engineers | ❌ No | Internal use, any size |
| **Consulting firm** uses KB Labs to audit client code | ❌ No | Your employees using it |
| **DevOps company** integrates Mind Engine into their CI/CD product | ❌ No | Using one component in different product |
| **Plugin developer** builds KB Labs plugins and sells them | ❌ No | Plugins are extensions, not competing product |
| **SaaS company** offers "KB Labs Cloud" for $99/month | ✅ Yes | Hosted service for customers |
| **Dev tools vendor** bundles KB Labs into proprietary platform they sell | ✅ Yes | Resale/competing product |
| **Open source project** forks KB Labs and adds features | ❌ No | Open source fork is fine (keep license) |
| **Company** white-labels KB Labs for enterprise clients | ✅ Yes | Resale |

---

## 🤝 Philosophy Behind This License

**Why not pure open source (MIT/Apache)?**
- We want to protect against large companies taking our platform, offering it as SaaS, and competing with us directly.
- "Open core" model: open source for **use**, but restrictions on **resale as a service**.

**Why not fully proprietary?**
- We believe in open source values and want developers to learn from and extend KB Labs.
- We want a thriving plugin ecosystem.
- Internal use should always be free.

**What we're protecting:**
- ❌ Someone offering "KB Labs Cloud" as SaaS
- ❌ Someone cloning the entire platform and competing

**What we encourage:**
- ✅ Companies using KB Labs internally (any size!)
- ✅ Developers building plugins and extensions
- ✅ Creative uses of individual components
- ✅ Learning, education, research

---

## ❓ FAQ

### Can I use KB Labs at my company?
**Yes!** Any company size, unlimited employees, for internal use.

### Can consultants use KB Labs on client projects?
**Yes!** As long as your employees are using it, and clients don't directly access KB Labs.

### Can I create and sell KB Labs plugins?
**Yes!** Plugins are extensions, not competing products.

### Can I fork KB Labs and publish it on GitHub?
**Yes!** Just keep the license and note it's modified.

### Can I use Mind Engine in my AI product?
**Yes!** Using individual components in different products is allowed.

### Can I offer "KB Labs as a Service"?
**No** — unless you get a commercial license.

### Can I bundle KB Labs into my platform I sell?
**Depends** — if it's just using components, maybe yes. If it's competing platform, probably no. Contact us to discuss.

### What if I'm not sure?
**Ask us!** contact@kblabs.dev — better to clarify than risk violation.

---

## 📞 Still Have Questions?

**Email:** contact@kblabs.dev

We're here to help and open to discussions. We want KB Labs to be widely used while maintaining sustainability.

---

**Last updated:** 2025-12-10
**License version:** KB Public License v1.1
**Legal text:** [LICENSE-KB-PUBLIC](LICENSE-KB-PUBLIC)
