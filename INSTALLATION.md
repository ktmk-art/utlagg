# Utläggskollen – installation (ca 15 min, ingen kod behövs)

Du har tre filer:
- **index.html** – själva webbsidan
- **Code.gs** – Google-skriptet som sparar utläggen och hämtar växelkurser
- **INSTALLATION.md** – den här guiden

Knappar och menyer står nedan med sina engelska namn, precis som de heter på skärmen.

---

## Del 1 – Google-arket (lagringen)

1. Gå till **sheets.new** (då skapas ett nytt Google-ark). Klicka på **Untitled spreadsheet** uppe till vänster och döp om arket till t.ex. *Utläggskollen*.
2. I menyn: **Extensions → Apps Script**. En kodredigerare öppnas i en ny flik.
3. Klicka på **Untitled project** högst upp till vänster och döp om projektet till *Utläggskollen*. Det är inte nödvändigt, men det gör varningen i steg 5 tydligare.
4. Markera all kod som redan finns där (`function myFunction() {}`) och radera den. Öppna **Code.gs** från mig, kopiera **allt** och klistra in. Klicka på **diskett-ikonen** (**Save project**).
5. **Testa kurserna:**
   - I rullgardinsmenyn till höger om **Debug**, överst i redigeraren, väljer du **testaKurser**. Tryck på **▶ Run**.
   - Första gången ber Google om behörighet: **Review permissions** → välj ditt Google-konto.
   - Rutan **Google hasn't verified this app** dyker upp. Den är normal, eftersom skriptet är ditt eget och inte granskat av Google (utvecklaren som anges är ditt eget konto). Klicka **Advanced** → **Go to Utläggskollen (unsafe)** → **Allow**.
   - Längst ner öppnas **Execution log**. Där ser du vilka källor som svarade, t.ex. `Mastercard={"kurs":12.43…}`. Står det `null` för Mastercard och Visa används ECB automatiskt.
6. **Publicera:**
   - **Deploy → New deployment**.
   - Klicka på **kugghjulet** bredvid **Select type** och välj **Web app**.
   - *Description:* valfritt, t.ex. "Utläggskollen"
   - *Execute as:* **Me**
   - *Who has access:* **Anyone** (inte "Anyone with Google account")
   - Tryck **Deploy** och kopiera **Web app URL**, den som slutar på `/exec`.

## Del 2 – Webbsidan på GitHub

1. Skapa ett gratis konto på **github.com** (om du inte har ett).
2. Klicka **+** uppe till höger → **New repository**. Namn: `utlagg`. Välj **Public**. Kryssa i **Add a README file**. Tryck **Create repository**.
3. Klicka **Add file → Upload files** och dra in **index.html**. Tryck **Commit changes**.
4. Klicka på **index.html** i listan → **penn-ikonen** (**Edit this file**). Högst upp finns raden
   `const SCRIPT_URL = "";`
   Klistra in din Web app URL mellan citattecknen, t.ex.
   `const SCRIPT_URL = "https://script.google.com/macros/s/AKfy…/exec";`
   Tryck **Commit changes…** och sedan **Commit changes** igen.
5. Gå till **Settings → Pages**. Under **Branch** väljer du **main** och **/ (root)** → **Save**.
6. Efter 1–2 minuter finns sidan på
   **https://DITT-ANVÄNDARNAMN.github.io/utlagg/**

## Del 3 – Använda den

1. Öppna adressen ovan, skriv namnet på resan och tryck **Skapa länk**.
2. Skicka länken till alla som är med. Där lägger var och en in sina utlägg: vem som betalade, belopp, valuta och vilka som delar.
3. Under **Avräkning** ser alla vem som ska swisha vad till vem, med så få betalningar som möjligt.

Alla utlägg syns också i ditt Google-ark (fliken *Utlägg*) om du vill kontrollera eller ändra något.

---

### Bra att veta
- **Växelkurs:** Sidan hämtar senaste kursen från Mastercard i första hand, Visa i andra och ECB som reserv. Varje kurs jämförs mot ECB, så en felaktig hämtning kan inte slinka igenom. Kursen fylls i automatiskt, men den går alltid att ändra för hand (t.ex. till kursen på kontoutdraget). Under varje utlägg står vilken källa som användes.
- **Ändra ett utlägg:** Ta bort det och lägg in det igen.
- **Behörighet:** Alla som har länken kan lägga till och ta bort utlägg. Dela den bara med dem som är med på resan.
- **Om du ändrar i Code.gs senare:** Gå till **Deploy → Manage deployments** → **penn-ikonen** → under **Version** välj **New version** → **Deploy**. Annars används den gamla koden, och adressen förblir densamma.
