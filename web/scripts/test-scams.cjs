// Wider check of the scam rules: npm run test-scams
// Scams must be caught (at least "medium", which sends them to the AI for a closer look),
// and everyday emails and pages must stay quiet ("low"), so KinGuard isn't annoying to use.
const rules = require("../../extension/rules.js");

// [minimum risk, sender (or ""), text]
const SCAMS = [
  // Fake account and security emails
  ["medium", "Amazon Security <alert@amazon-account-help.com>", "Your account will be permanently deleted in 24 hours. Verify your account now to keep access."],
  ["medium", "", "We detected suspicious activity on your bank account. Verify your account immediately to avoid suspension."],
  ["medium", "IT Helpdesk <helpdesk@mail-portal365.com>", "Your password expires today. Click here to keep your current password."],
  ["medium", "", "Your mailbox is full. Upgrade or verify your account within 24 hours or your email will be disabled."],
  ["high", "", "This is your bank's fraud department. Reply with the security code we just sent you right away to stop the transfer."],
  // Fake bills, purchases and refunds
  ["high", "Norton Billing <renewals@nortonsecure-billing.net>", "Your Norton antivirus subscription has been renewed for $499.99. If you did not authorize this charge, call 1-888-555-0147 to cancel."],
  ["high", "", "Your order for a MacBook Pro ($2,199.00) has been confirmed. If you did not place this order, call 1-844-555-0190 immediately to dispute it."],
  ["high", "PayPal Billing <paypal.billing.dept@gmail.com>", "You've received an invoice for $649.00. Call support at 1-855-555-0182 if you don't recognize it."],
  ["medium", "", "Your refund of $850 is ready. Confirm your bank details to receive it today."],
  ["medium", "Netflix <billing@netflix-account-update.com>", "Your payment failed. Update your billing information to avoid interruption of your membership."],
  ["medium", "", "Payment is overdue. Settle the outstanding balance today to avoid collection."],
  ["medium", "USPS <noreply@usps-redelivery.com>", "Your parcel is on hold. Pay a small redelivery fee of $1.99 to release it."],
  // Government, legal and debt threats
  ["medium", "IRS Refunds <refund@irs-gov.org>", "You qualify for a tax refund of $1,240. Submit your information to claim it within 48 hours."],
  ["high", "", "This is the tax office. Pay immediately or a warrant will be issued for your arrest. Payment by gift cards only."],
  ["medium", "", "Your Social Security number has been suspended due to suspicious activity. Call us immediately at 1-877-555-0111."],
  ["medium", "", "Court summons: you must download the attached documents and appear in court. Failure to appear results in legal action."],
  ["medium", "", "Unpaid toll: your violation must be paid immediately to avoid penalties. Pay now at the link below."],
  ["medium", "", "Final notice: pay your outstanding debt today to avoid legal action. This is a debt collection attempt."],
  // Job, school and student scams
  ["medium", "", "Congratulations! You've been selected for a remote position without an interview. Send your Social Security number to start onboarding."],
  ["high", "", "Welcome aboard! Deposit this check and buy your work computer from our approved vendor using Zelle."],
  ["high", "", "You've been awarded a scholarship of $5,000! Pay a $95 processing fee to receive it."],
  ["medium", "", "Your student email will be disabled unless you sign in here to verify your account today."],
  ["high", "", "You qualify for immediate student loan forgiveness. Pay our $299 processing fee to get your loan cancellation started."],
  ["high", "", "Earn $300 a day by rating products! Deposit $100 to unlock your earnings and commission."],
  // Emotional scams
  ["high", "", "I hacked your webcam and recorded you. Pay $1,500 in Bitcoin within 48 hours or I will send the video to all your contacts."],
  ["high", "", "My love, I've fallen for you, but I urgently need money to visit you. Please send it with a gift card, my dear."],
  ["high", "", "A deceased relative left you an inheritance of $4.2 million. Pay the legal fees to claim it."],
  ["high", "", "Congratulations! You've won a prize of $50,000. Pay the processing fee and shipping to claim your prize."],
  ["high", "Connor DelRosso <someone@gmail.com>", "CONGRATULATIONS, YOU HAVE WON!!! Dear Lucky Winner, your email address has been selected as one of our LUCKY WINNERS. You have won the sum of $850,000.00 USD and are required to contact our payment officer immediately. To claim your prize, visit our official claim portal. This prize is valid for limited time only. We await your urgent response."],
  ["medium", "", "Help hurricane victims now. Donate today using this urgent payment link and a sponsor will double your donation."],
  ["high", "", "Grandpa it's me, I'm in jail after a car accident. I need money immediately for bail. Please don't tell anyone."],
  // Fake ransomware / scare screens
  ["high", "", "Bad news, your files have been encrypted! You can access them again if you pay a ransom. Hurry! Your files will be permanently deleted in one hour."],
  ["high", "", "Your computer has been locked. Call Microsoft Support at 1-888-555-0123 to unlock it."],
  // Files, links and attachments
  ["medium", "", "Please open the attached invoice and confirm payment within 24 hours."],
  ["medium", "Docs Share <share@docs-share-secure.com>", "Someone shared a confidential file with you. Sign in to view the document."],
  ["medium", "DocuSign <sign@docusign-review.net>", "Your signature is required to complete this document. Review and sign today."],
  ["high", "", "Verify you are human. Press Windows + R, then press Ctrl + V and hit Enter to complete the CAPTCHA."],
  ["medium", "", "Your account is locked. Scan this QR code to restore your account immediately."],
  ["medium", "", "Your storage is full. Your files will be deleted unless you download this update today."],
  // Business, employees and coworkers
  ["high", "", "I'm in a meeting and can't talk. I need you to send a wire transfer now and keep this confidential."],
  ["medium", "", "Our banking details have changed. Please use this new account for all future payments."],
  ["medium", "", "Please send me the W-2s for all employees today. I need them for an urgent audit."],
  ["medium", "", "Your salary details need to be updated. Sign in here to update your direct deposit before payroll runs."],
  ["high", "", "Are you available? Quick favor: buy some gift cards for the team and send me the codes. I'm in a meeting."],
  // More
  ["medium", "", "Reserve your puppy today! Pay a $300 deposit to hold him, and we'll ship after payment."],
  ["high", "", "Lost money to a scam? Our fund recovery service can recover your stolen crypto for an upfront processing fee."],
  ["high", "", "Claim free government grant funds of $9,000. Pay the processing fee to release your grant."],
  ["high", "", "Your loan is approved! Pay the insurance fee first to release your funds."],
  ["high", "", "Guaranteed returns with no risk. Double your money with our crypto trading platform."],
];

const SAFE = [
  ["Amazon.com <shipment-tracking@amazon.com>", "Your package has shipped! Arriving Thursday. Track your package in Your Orders."],
  ["Amazon.com <auto-confirm@amazon.com>", "Thanks for your order. Your order has been confirmed and will arrive Friday. Order total: $24.99."],
  ["Google <no-reply@accounts.google.com>", "You requested a password reset. If this was you, you can safely ignore this email."],
  ["Chase <no.reply.alerts@chase.com>", "Your statement is ready. Sign in to chase.com or the Chase app to view it."],
  ["Emma <grandkid@example.com>", "Hi Grandpa! Here are the pictures from Saturday's game. See you Sunday for dinner."],
  ["Netflix <info@mailer.netflix.com>", "New this week: three new series and a documentary we think you'll love."],
  ["LinkedIn <jobs-noreply@linkedin.com>", "New jobs for you: Store Manager at Hometown Market, Accountant at Valley Electric."],
  ["American Red Cross <info@redcross.org>", "Thank you for your donation last year. Here's how your gift helped families after the floods."],
  ["Dr. Patel's Office <frontdesk@valleyfamilymed.example>", "Reminder: your appointment is Tuesday at 10 am. Reply C to confirm."],
  ["Hometown Market <deals@hometownmarket.example>", "This week only: 20% off holiday gift cards. Perfect for the grandkids!"],
  ["Valley Electric <billing@valleyelectric.example>", "Your monthly bill of $118.45 is ready. It will be paid automatically on the 15th."],
  ["PayPal <service@paypal.com>", "You sent $25.00 to Sarah. Thanks for using PayPal."],
  ["Microsoft account team <account-security-noreply@accountprotection.microsoft.com>", "Security info was added to your account. If this was you, no action is needed."],
  ["Church Office <office@stmarks.example>", "Bake sale this Sunday after service. Donations of cookies welcome!"],
  ["", "Joe's Pizza - Best pizza in State College. Order online now. Two large pizzas for $19.99. Call (814) 555-0101 for delivery."],
  ["", "Weather: sunny with a high of 62. Tomorrow, rain likely in the afternoon."],
  ["", "Recipe: Grandma's apple pie. Ingredients: 6 apples, 1 cup sugar, cinnamon, butter, pie crust. Bake at 375 for 50 minutes."],
  ["", "Hometown Market gift cards. Pick a design, choose an amount, and pick it up at the front counter. Buy now."],
  ["", "State College Area School District: the school board meeting is Monday at 7 pm. The public is welcome."],
  ["Hometown Market <deals@hometownmarket.example>", "Thanks for entering our holiday sweepstakes! Winners will be announced on December 1. Good luck!"],
  ["", "Congratulations to our science fair winners! Emma took first prize for her project on bees."],
  ["", "Your Social Security statement is available online at ssa.gov. Sign in to my Social Security to view your earnings record."],
];

let ok = 0;
let total = 0;
const RANK = rules.RANK;
console.log("SCAMS (must be caught):");
for (const [min, sender, text] of SCAMS) {
  total++;
  const r = rules.analyze(text, { sender });
  const pass = RANK[r.risk] >= RANK[min];
  if (pass) ok++;
  console.log(`${pass ? "PASS" : "FAIL"}  need ${min.padEnd(6)} got ${r.risk.padEnd(6)} ${String(r.scamTypeName || "").padEnd(42)} ${text.slice(0, 60)}`);
}
console.log("\nEVERYDAY (must stay quiet):");
for (const [sender, text] of SAFE) {
  total++;
  const r = rules.analyze(text, { sender });
  const pass = r.risk === "low";
  if (pass) ok++;
  console.log(`${pass ? "PASS" : "FAIL"}  got ${r.risk.padEnd(6)} ${pass ? "" : r.cues.map((c) => c.cue).join(",") + "  "}${text.slice(0, 70)}`);
}
console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
