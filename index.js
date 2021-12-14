const fs = require("fs");
const twilio = require("twilio");
const { chromium } = require("playwright-chromium");

const accountSid = YOUR_TWILIO_ACCOUNT_ID;
const authToken = YOUR_TWILIO_AUTH_TOKEN;
const myNumber = YOUR_PHONE_NUMBER; // el mismo que tienes para verificar la cuenta de twilio (solo si usas twilio gratis)
const twilioNumber = YOUR_TWILIO_NUMBER;
const film_to_search = "spider";

fs.readdir("./video", async (err, files) => {
  if (err) throw err;

  for (const file of files) {
    fs.unlink("./video/" + file, (err) => {
      if (err) throw err;
    });
  }
});

fs.readdir("./screenshots", (err, files) => {
  if (err) throw err;

  for (const file of files) {
    fs.unlink("./screenshots/" + file, (err) => {
      if (err) throw err;
    });
  }
});

spiderScraper();
setInterval(() => {
  spiderScraper();
}, 30000);

async function spiderScraper() {
  console.log("--- Spiderman, Spiderman🎶🎶 ---");
  await fs.readFile("multiverse.txt", "utf8", async (err, data) => {
    if (err) return false;

    if (data.length > 0) {
      console.log(data);
      return true;
    } else {
      const browser = await chromium.launch({ headless: true }); // ponlo en false para ver el navegador
      const context = await browser.newContext({
        recordVideo: {
          dir: "video/",
          name: "video",
          size: { width: 1024, height: 1024 },
          path: "video/video.mp4",
          bitrate: "1M",
          fps: 30,
          quality: "high",
          codec: "libx264",
          disableAudio: false,
        },
      });

      const page = await context.newPage();
      const url = "https://odeonmulticines.com/odeon-multicines-leon";

      const film_day = "day-2021-12-16";

      await page.goto(url);

      const hrefs = await page.$$eval(".grid-afiche a", (anchors) => {
        return anchors.map((anchor) => anchor.href);
      });

      const film_available = hrefs.filter((href) =>
        href.includes(film_to_search)
      ).length
        ? true
        : false;

      if (!film_available) {
        console.log("Todavía no se pueden reservar las entradas 🕸️⛔");
        await browser.close();
        await context.close();
        return;
      }

      const href_to_search = hrefs.filter((href) =>
        href.toLowerCase().includes(film_to_search)
      )[0];
      await page.goto(href_to_search);

      console.log("Ya se pueden reservar las entradas!!! 🕸️👌");
      await send_sms("Ya están las entradas🕸️👌\n" + href_to_search);

      console.log("Vamos a seleccionar la hora de la peli 🕐🎦");
      let clase_btn = ".show-session-sessions > .btn_sesion";

      // sacamos tanto 2D como atmos TODO: hacer uno solo
      let available_times = await page.$$eval(clase_btn, (anchors) => {
        return anchors.map((anchor) => anchor.textContent);
      });

      available_times = [available_times[0], available_times[1]];

      console.log(
        "Las 2 primeras horas disponibles para la pelicula son:",
        available_times,
        "vamos a ver cuanta gente hay en la primera y en la segunda sesion"
      );

      await check_sites(1, page, film_day, available_times[0], href_to_search);
      await page.goto(href_to_search);
      await check_sites(2, page, film_day, available_times[1], href_to_search);

      console.log("Cerrando el programa...");
      await browser.close();
      await context.close();
      console.log("Programa cerrado");
    }
  });
}

async function send_sms(text) {
  const client = require("twilio")(accountSid, authToken);
  let img = "https://es.web.img3.acsta.net/pictures/21/11/15/18/17/0807353.jpg";

  await client.messages
    .create({
      mediaUrl: img,
      body: text,
      from: `whatsapp:${twilioNumber}`,
      to: `whatsapp:${myNumber}`,
    })
    .then()
    .catch((err) => console.log("Error al mandar el mensaje:", err))
    .done();

  await fs.writeFile("./multiverse.txt", "Multiverse is real!!!", (err) => {
    if (err) throw err;
  });
}

async function check_sites(sessionId, page, film_day, hour, film_url) {
  let available_sites = [];

  await page.click(
    `.${film_day} > .item-session > .show-session-sessions > .btn_sesion:nth-child(${sessionId})`
  );

  let myTickets = 0;

  for (let i = 0; ; i++) {
    await page.click('.spinner__button[role="inc"]');
    myTickets++;
    if (myTickets === 8) {
      break;
    }
  }

  await page.click('button[role="next"]');

  // butacas disponibles, y butacas asiento covid
  available_sites = await page.$$eval('img[data-seat="001"]', (anchors) => {
    return anchors.map((anchor) => {
      return {
        row: Number(anchor.dataset.row),
        column: Number(anchor.alt),
      };
    });
  });

  // do the same with seat equal to 002
  available_sites = available_sites.concat(
    await page.$$eval('img[data-seat="002"]', (anchors) => {
      return anchors.map((anchor) => {
        return {
          row: Number(anchor.dataset.row),
          column: Number(anchor.alt),
        };
      });
    })
  );

  let total_available_sites = available_sites.length;
  let sites_between_12_and_9 = available_sites.filter(
    (site) =>
      site.row <= 12 && site.row >= 9 && site.column > 4 && site.column < 15
  );

  let img_path = "./screenshots/" + film_day + "_" + hour + ".png";
  await page.screenshot({ path: img_path });

  const texto_res = `Hay un total de: ${total_available_sites} asientos disponibles. Entre las filas 12 y 9 hay un total de: ${sites_between_12_and_9.length} asientos disponibles, estos son de la sesión de las: ${hour}\nCompra las entradas aquí: ${film_url}`;

  console.log(texto_res + "\n");
  await send_sms(texto_res);
}
