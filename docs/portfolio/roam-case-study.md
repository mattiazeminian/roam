# ROAM — portfolio case study

## Prompt for mattiazeminian.com

Create a concise, premium product-design case study for **ROAM**, a mobile
running app designed around one simple question: *where should I run today?*

Use a dark, editorial visual direction with near-black surfaces, electric
lime accents, large condensed numerals, quiet dividers, and generous
whitespace. The page should feel like a product portfolio piece for a UX/UI
designer, not a generic fitness-app landing page.

Structure the page as:

1. Hero: ROAM wordmark, one-sentence positioning, a large device mockup, and
   a lime accent line. Use the strongest Home/Today screen as the hero image.
2. Problem: runners often know how far they want to run, but not where to go.
   Existing apps can feel like dashboards, social feeds, or map tools.
3. Product idea: ROAM turns distance into a runnable route from the runner's
   current location, then tracks and records the effort.
4. Experience walkthrough: Today/Home, Start Run, generated Routes, Active Run,
   and Activity/Run Detail. Use short captions and real screenshots.
5. Design decisions: information-first Home, route geometry only when useful,
   prominent Start Run action, readable metrics, and a navigation model of
   Home / Routes / Activity / Profile.
6. What was built: a compact feature list with icons or small UI fragments.
7. Constraints and next steps: explain that routing depends on a provider,
   location permissions and network availability; mention route-quality
   refinement, accessibility QA, and App Store production hardening as next
   steps.
8. Footer CTA: “Designed and built by Mattia Zeminian.”

Keep copy short. Use one strong sentence per section, no more than six
feature bullets, and no exaggerated claims. Add subtle scroll reveal and one
short looping interaction showing Start Run opening into route generation.

## Short case-study copy

**ROAM is a running app for people who know the distance, but not the route.**

The product turns a desired distance into a runnable route from the runner's
current location. The interface prioritizes Today, makes Start Run the primary
action, and uses maps only when they communicate real route information.

### What has been done

- Restructured navigation into Home, Routes, Activity, and Profile.
- Preserved Record as a non-tab Start Run flow.
- Built distance-based route generation from the runner's current location.
- Added route selection, saved routes, route editing, sharing, and run detail.
- Added active-run tracking, recovery, history, personal records, and training
  plan surfaces.
- Refined the visual system around editorial typography, numeric hierarchy,
  dark surfaces, lime accent states, and readable run metrics.

### Known limitations

- Route generation still depends on external routing and map providers.
- GPS, permissions, connectivity, and provider availability need production QA.
- Route shape quality is being refined to balance loops, out-and-backs, and real
  street constraints.
- The portfolio should present this as a strong working product direction,
  while being clear that some production hardening remains.

## Recommended visual set

Use five stills:

1. Home / Today — the product's main information hierarchy.
2. Start Run — distance choice and the primary action.
3. Routes — generated route options and meaningful geometry.
4. Active Run — live distance, time, pace, and route progress.
5. Activity / Run Detail — history, metrics, and recorded route.

Use one short GIF or MP4, 3–5 seconds, showing: Home → Start Run → distance
selection → generated route. Keep it silent, cropped to the device, and loop it
once or twice. A second optional clip can show the countdown entering Active
Run.

## How to proceed

1. Copy the “Prompt for mattiazeminian.com” section into the website builder.
2. Place the exported screenshots in `/assets/roam/` using the names
   `home-today`, `start-run`, `routes`, `active-run`, and `activity-detail`.
3. Use the Home / Today screen as the hero visual; use Routes and Active Run as
   the two supporting visuals above the fold.
4. Add the short interaction clip only after the still layout is working.
5. Link the repository and label the project “Product design + React Native
   implementation.”
