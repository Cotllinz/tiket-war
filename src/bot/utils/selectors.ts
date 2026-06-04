/**
 * CSS/XPath selectors for tiket.com
 * These selectors target the tiket.com explore/event page structure.
 * 
 * IMPORTANT: These selectors may need to be updated before the actual war
 * as tiket.com can change their DOM structure at any time.
 * Run `npm run dry-run` to verify selectors are still valid.
 */

export const SELECTORS = {
  // === LOGIN ===
  login: {
    // Header login button or popup login button
    loginButton: '[data-testid="header-login-button"], button:has-text("Masuk"), a:has-text("Masuk"), button:has-text("Log in"), button:has-text("Login")',
    // Email/Phone input on login page
    emailInput: 'input[type="email"], input[name="email"], input[placeholder*="email" i], input[type="tel"], input[name="phone"], input[name="username"], input[placeholder*="nomor hp" i], input[placeholder*="nomor" i]',
    // Option button to login with email or phone (avoid matching container divs that might include Apple login)
    phoneEmailLoginOptionButton: 'button:has-text("nomor HP atau email"), div[role="button"]:has-text("nomor HP atau email"), button:has-text("Nomor HP"), button:has-text("nomor HP"), button:has-text("No. HP"), button:has-text("no. hp"), a:has-text("Nomor HP"), div[role="button"]:has-text("Nomor HP")',
    // Password input
    passwordInput: 'input[type="password"], input[name="password"]',
    // Submit login button
    submitButton: 'button[type="submit"], button:has-text("Masuk"), button:has-text("Login")',
    // OTP input (if required)
    otpInput: 'input[name="otp"], input[inputmode="numeric"]',
    // User avatar/name in header (indicates logged in)
    userAvatar: '[data-testid="header-user-avatar"], [data-testid="header-profile"]',
    // Login with email tab/option
    emailLoginTab: 'button:has-text("Email"), [data-testid="login-email-tab"]',
    // Continue button after email
    continueButton: 'button:has-text("Lanjut"), button:has-text("Continue")',
    // Login modal/page
    loginModal: '[data-testid="login-modal"], [class*="login"]',
  },

  // === EVENT PAGE ===
  event: {
    // Main event container
    container: '[data-testid="dynamic-landing-page-content"], main',
    // Event title
    title: 'h1, [data-testid="event-title"]',
    // Buy ticket button
    buyButton: 'button:has-text("Beli Tiket"), button:has-text("Buy"), a:has-text("Beli"), button:has-text("Pesan")',
    // Show date selector
    dateSelector: '[data-testid="date-selector"], [class*="date-select"]',
    // Specific date option
    dateOption: (date: string) => `button:has-text("${date}"), [data-testid="date-${date}"]`,
  },

  // === WAITING ROOM ===
  waitingRoom: {
    // Waiting room container
    container: '[class*="waiting"], [class*="queue"], [id*="queue"], [data-testid*="queue"]',
    // Queue position text
    position: '[class*="position"], [class*="queue-number"]',
    // Waiting room status message
    statusMessage: '[class*="waiting"] p, [class*="queue"] p, [class*="status-message"]',
    // Progress bar
    progressBar: '[class*="progress"], [role="progressbar"]',
    // Redirect indicator (no longer in waiting room)
    exitIndicator: '[data-testid="ticket-selection"], [class*="ticket-category"]',
  },

  // === TICKET SELECTION ===
  ticket: {
    // Category container
    categoryContainer: '[data-testid="ticket-category"], [class*="ticket-category"], [class*="category-list"]',
    // Initial Buy Tickets Now button (Beli tiket sekarang)
    initialBuyButton: 'button:has-text("Beli tiket sekarang"), a:has-text("Beli tiket sekarang")',
    // Verify code button (Verifikasi kode)
    verifyCodeButton: 'button:has-text("Verifikasi kode"), [data-testid="verify-code"]',
    // Presale input
    presaleInput: 'input[placeholder*="kode" i], input[placeholder*="code" i], input[name*="promo" i], input[name*="code" i], input[name*="presale" i], input[placeholder*="membership" i]',
    // Presale submit button
    presaleSubmit: 'button:has-text("Submit"), button:has-text("Apply"), button:has-text("Gunakan"), button:has-text("Terapkan"), button:has-text("Verifikasi")',
    // Individual category item (parametric)
    categoryItem: (name: string) => [
      `button:has-text("${name}")`,
      `[data-testid="category-${name.toLowerCase().replace(/\s+/g, '-')}"]`,
      `div:has-text("${name}") >> button`,
      `label:has-text("${name}")`,
      `[class*="category"]:has-text("${name}")`,
      `div:has-text("${name}")` // fallback
    ].join(', '),
    // Quantity selector
    quantityInput: 'input[type="number"], [data-testid="quantity-input"]',
    // Quantity plus button
    quantityPlus: 'button:has-text("+"), [data-testid="quantity-plus"], [class*="quantity"] button:last-child',
    // Quantity minus button
    quantityMinus: 'button:has-text("-"), [data-testid="quantity-minus"], [class*="quantity"] button:first-child',
    // Sold out indicator
    soldOut: ':has-text("Sold Out"), :has-text("Habis"), :has-text("Tidak Tersedia")',
    // Add to cart / proceed button
    addToCart: 'button:has-text("Beli"), button:has-text("Tambah"), button:has-text("Pesan"), button:has-text("Lanjut")',
    // Available ticket indicator
    available: ':has-text("Tersedia"), :has-text("Available")',
  },

  // === CHECKOUT FORM ===
  checkout: {
    // Form container
    formContainer: '[data-testid="checkout-form"], form, [class*="checkout"]',
    // Full name input
    nameInput: 'input[name="fullName"], input[name="name"], input[placeholder*="nama" i], input[placeholder*="name" i]',
    // Identity number (NIK/KTP)
    identityInput: 'input[name="identityNumber"], input[name="nik"], input[placeholder*="NIK" i], input[placeholder*="KTP" i], input[placeholder*="identitas" i]',
    // Email
    emailInput: 'input[name="email"], input[type="email"], input[placeholder*="email" i]',
    // Phone
    phoneInput: 'input[name="phone"], input[type="tel"], input[placeholder*="telepon" i], input[placeholder*="phone" i], input[placeholder*="HP" i]',
    // Identity type dropdown
    identityTypeSelect: 'select[name="identityType"], [data-testid="identity-type"]',
    // Terms & conditions checkbox
    termsCheckbox: 'input[type="checkbox"], [data-testid="terms-checkbox"]',
    // Continue to payment button
    continueButton: 'button:has-text("Lanjut"), button:has-text("Bayar"), button:has-text("Continue"), button[type="submit"]',
    // Order summary
    orderSummary: '[data-testid="order-summary"], [class*="order-summary"]',
    // Attendee form (for each ticket holder)
    attendeeForm: (index: number) => `[data-testid="attendee-${index}"], [class*="attendee"]:nth-child(${index + 1})`,
  },

  // === PAYMENT ===
  payment: {
    // Payment method container
    container: '[data-testid="payment-methods"], [class*="payment-method"], [class*="payment-list"]',
    // QRIS option
    qris: [
      'button:has-text("QRIS")',
      '[data-testid="payment-qris"]',
      'label:has-text("QRIS")',
      'div:has-text("QRIS") >> button',
      '[class*="payment"]:has-text("QRIS")',
    ].join(', '),
    // Mandiri Virtual Account option
    mandiri: [
      'button:has-text("Mandiri")',
      '[data-testid="payment-mandiri"]',
      'label:has-text("Mandiri")',
      'div:has-text("Mandiri") >> button',
      '[class*="payment"]:has-text("Mandiri")',
    ].join(', '),
    // Pay now button
    payButton: 'button:has-text("Bayar"), button:has-text("Pay"), button:has-text("Konfirmasi")',
    // QR Code image
    qrCode: 'img[alt*="QR" i], [data-testid="qr-code"], canvas[class*="qr"]',
    // VA Number
    vaNumber: '[data-testid="va-number"], [class*="va-number"], [class*="account-number"]',
    // Payment success
    success: ':has-text("Berhasil"), :has-text("Success"), [data-testid="payment-success"]',
    // Payment deadline/timer
    deadline: '[class*="countdown"], [class*="timer"], [data-testid="payment-deadline"]',
  },

  // === GENERIC ===
  generic: {
    // Loading spinner
    loading: '[class*="loading"], [class*="spinner"], [role="progressbar"]',
    // Error/alert message
    error: '[class*="error"], [class*="alert-danger"], [role="alert"]',
    // Modal close button
    modalClose: 'button[aria-label*="close" i], [data-testid="modal-close"], button:has-text("✕"), button[class*="close_button" i], button[class*="close-button" i]',
    // Cookie consent
    cookieConsent: 'button:has-text("Accept"), button:has-text("Terima"), [data-testid="cookie-accept"]',
    // Popup dismiss
    popupDismiss: '[data-testid="popup-close"], [class*="popup"] button:has-text("✕"), button[class*="close_button" i], button[class*="close-button" i]',
  },
} as const;
