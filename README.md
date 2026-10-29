# MESHTRIFTY: Cloudflare Pages + Supabase

The storefront is a static Cloudflare Pages site with Pages Functions for private operations. Supabase Auth manages customer accounts; Supabase Postgres stores products and orders. Customers pay **cash on delivery only**. No card data or online payment is collected.

## 1. Create the Supabase project

1. Create a Supabase project and keep its database password private.
2. In **SQL Editor**, run [`supabase/migrations/20261030000000_commerce.sql`](./supabase/migrations/20261030000000_commerce.sql), then [`supabase/migrations/20261030010000_remove_mfa_requirement.sql`](./supabase/migrations/20261030010000_remove_mfa_requirement.sql). If the commerce migration was already run, only run the second migration.
3. In **Authentication → URL Configuration**, set the production storefront URL as the Site URL and allow the storefront's production URL (including `/index.html`) as a redirect URL. Signup confirmation and password recovery redirect back to `/index.html`.
4. Enable email confirmation in **Authentication → Providers → Email**. For this school/demo project, use Supabase's built-in email sender and customize its **Reset Password** template using [`supabase/email-templates/reset-password.html`](./supabase/email-templates/reset-password.html). The built-in sender is free, but restricted to addresses belonging to members of the Supabase organization and currently limited to 2 emails per hour; its limits can change and it has no delivery SLA. This is suitable for testing/demo, not public production use.
5. In **Project Settings → API**, note the project URL, publishable/anon key, and service-role/secret key. The service-role key must never be put in browser code.

The migration seeds the sample products with **zero stock and hidden status** because real inventory was not provided. Set real stock and publish each available item from the admin panel before accepting orders. The initial flat shipping fee is PHP 100 and can be changed in the admin panel.

## 2. Deploy to Cloudflare Pages

1. Put this project in a Git repository and push it to a private GitHub or GitLab repository.
2. In Cloudflare, create a **Workers & Pages → Pages** project and connect that repository.
3. Use the project root as the root directory. There is no build step; leave the build command empty and set the output directory to `.`. Cloudflare Pages detects the `functions/` directory and deploys the API routes.
4. Add these variables in the Pages project's **Settings → Variables and Secrets** for both Preview and Production as appropriate:

   | Name | Cloudflare setting | Value |
   |---|---|---|
   | `SUPABASE_URL` | Variable | Supabase project URL |
   | `SUPABASE_ANON_KEY` | Variable | Supabase publishable/anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Supabase service-role/secret key |
   | `ADMIN_EMAILS` | Variable | Comma-separated, verified admin email addresses |

5. Deploy and attach your domain in Cloudflare Pages. Add the final domain to Supabase's Site URL and redirect allowlist, then redeploy.

Do not commit Supabase keys, passwords, customer data, or local environment files. Never expose the service-role key to the browser or a public repository.

## 3. Customize and test password-reset email

1. In Supabase, open **Authentication → Email Templates → Reset Password**.
2. Set the subject to `Reset your MESHTRIFTY password` and paste the HTML from [`supabase/email-templates/reset-password.html`](./supabase/email-templates/reset-password.html) into the message body.
3. Save, then request a reset for an email address belonging to a member of your Supabase organization. Supabase sends the message and handles the reset confirmation link; no PHP host, Composer, SMTP password, or Cloudflare email endpoint is needed.
4. Before public launch, configure a custom SMTP provider in Supabase Auth. The default sender is restricted and rate-limited, so it is only suitable for a school/demo project.

## 4. Create the first admin

1. Register the intended administrator email through the storefront and complete Supabase email confirmation.
2. Add that exact email to the Cloudflare `ADMIN_EMAILS` variable (comma-separated for multiple administrators) and redeploy.
3. Sign in at `/admin.html`. The server verifies the Supabase access token and checks the confirmed email against the allowlist on every admin request. Public signup does not grant admin access.
4. In Products, set accurate prices and stock, then publish products. In Settings, set the actual flat delivery fee.

## What's implemented

- Public catalog and category filters; product details and size selection.
- Browser-persisted cart and wishlist.
- Supabase email/password signup, sign-in, and email confirmation for customers and admins.
- Supabase Auth password recovery with a branded, responsive HTML email template and plain-text fallback.
- Authenticated order history and COD checkout.
- Server-authoritative prices, shipping, inventory checks, and atomic stock deduction when placing orders.
- Allowlisted admin panel for products, inventory, order status, dashboard totals, and shipping fees.
- Customer-scoped database row-level security; admin database operations stay behind Cloudflare Pages Functions.

Authenticator verification is not required. Admin accounts remain restricted by the `ADMIN_EMAILS` allowlist and confirmed email addresses.

Order statuses progress from Pending to Processing to Shipped to Completed. Pending or Processing orders may be cancelled; cancelling an order restores its stock. Payment collection, delivery, refunds, and contacting customers remain manual COD operations.

## Before accepting real orders

- Replace sample product names/images with products you are authorized to sell, and verify inventory and prices.
- Test signup, email confirmation, Supabase password reset, customer order isolation, unavailable stock, concurrent checkout, cancellation/restocking, and admin access using separate customer/admin accounts.
- Review Supabase Auth email deliverability, backup/retention, privacy policy, terms, delivery/return rules, and applicable tax and consumer requirements for your operating region.
- The project intentionally does not integrate an online payment gateway, automated shipping carrier, or newsletter/email marketing provider.
