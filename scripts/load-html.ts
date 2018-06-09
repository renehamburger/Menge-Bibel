
import * as request from 'request-promise-native';
import * as $ from 'cheerio';
import { bibleBooks, BibleBook } from './menge-bible-online';
import * as fse from 'fs-extra';

const ROOT_PATH = '..';
const ENCODING = 'utf8';

// Execute code. Immediately invoked function wrapper is needed to allow for asynchronous await.
(async function () {
  for (const type in bibleBooks) {
    const currentPath = `${ROOT_PATH}/Bibel/${type}`;
    fse.ensureDirSync(currentPath);
    for (const book of bibleBooks[type]) {
      log(`${book.bookName} `);
      const markdownFile = `${currentPath}/${book.bookName}.md`;
      fse.ensureFile(markdownFile);
      for (let chapter = 1; chapter <= book.chapters; chapter++) {
        // Retrieve chapters sequentially and with a break in between to limit load on online bible
        const bookMarkdown = await getChapter(book, chapter);
        if (chapter === 1) {
          fse.writeFileSync(markdownFile, bookMarkdown, ENCODING);
        } else {
          fse.appendFileSync(markdownFile, `\n\n${bookMarkdown}`, ENCODING);
        }
        log('.');
      }
      console.log('✓');
    }
  }
})();

// Log to terminal without newline
function log(text: string): void {
  process.stdout.write(text);
}

async function getChapter(book: BibleBook, chapter: number) {
  const htmlCacheFile = `${ROOT_PATH}/cache/${book.bookName}-${pad(chapter)}.html`;
  // const htmlCacheFile2 = `${ROOT_PATH}/cache/${book.bookName.replace(/^\d+ - /, '').replace(/\. /, '.')}-${pad(chapter)}.html`;
  let html: string;
  try {
    // if (fse.existsSync(htmlCacheFile2)) {
    //   fse.renameSync(htmlCacheFile2, htmlCacheFile);
    // }
    if (fse.existsSync(htmlCacheFile)) {
      html = fse.readFileSync(htmlCacheFile, ENCODING);
    } else {
      //-- Load chapter content from online bible (permission was granted)
      const response = await request(`https://www.die-bibel.de/bibeln/online-bibeln/menge-bibel/bibeltext/bibel/text/lesen/stelle/${book.bookNumber}/${chapter}0001/${chapter}9999/`);
      const element = $(response);
      const title = element.find('.bible-text .location .name').text();
      html = element.find('.bible-text .markdown').html() || '';
      if (chapter === 1) {
        html = `<title>${title}</title>\n${html}`;
      }
      fse.writeFileSync(htmlCacheFile, html, ENCODING);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    //-- Process html
    html = replaceUnicodeEntities(html);
    html = correctHtml(html);
    html = prettifyHtml(html);
    return convertToMarkdown(html);
  } catch (err) {
    console.error(err);
    return '';
  }
}

function pad(number: number): string {
  return `000${number}`.slice(-3);
}

function replaceUnicodeEntities(html: string): string {
  const hexadecimalEntityRegex = /&#x([0-9A-F]+);/gi;
  let result = html.replace(hexadecimalEntityRegex, (entity) => {
    const match = entity.match(new RegExp(hexadecimalEntityRegex.source, 'i'));
    return match ? String.fromCharCode(parseInt(match[1], 16)) : '';
  });
  const decimalEntityRegex = /&#([0-9]+);/gi;
  result = result.replace(decimalEntityRegex, (entity) => {
    const match = entity.match(new RegExp(decimalEntityRegex.source, 'i'));
    return match ? String.fromCharCode(parseInt(match[1], 10)) : '';
  })
  return result;
}

/** Corrects occasionally wrong span for study notes,
 *  e.g. `<span class="auslegung"> (vgl. </span>Hes 9,4)`*/
function correctHtml(html: string): string {
  return html
    .replace(/<span class="auslegung">( ?[(][^)]*)<\/span>([^)]*[)])/gi,
      '<span class="auslegung">$1$2</span>');
}

/** Removes redundant whitespaces */
function prettifyHtml(html: string): string {
  return html
    .replace(/\n[\n ]+/gi, '\n')
    .replace(/ +<\//gi, '</')
    .replace(/  +/gi, ' ')
    .replace(/<\/(div|p|h\d)></gi, '</$1>\n<')
}

function convertToMarkdown(html: string): string {
  let result = html
    .replace(/<p>(.*?)<\/p>\n/gi, '$1\n')
    .replace(/<div class="linebreak"><\/div>/gi, '\n')
    .replace(/^<title>(.*?)<\/title>\n*/gi, '# $1\n\n')
    .replace(/\n*<h1[^<]*>(.*?)<\/h1>\n*/gi, '\n\n## $1\n\n')
    .replace(/\n*<h2[^<]*>(.*?)<\/h2>\n*/gi, '\n\n### $1\n\n')
    .replace(/\n*<h3[^<]*>(.*?)<\/h3>\n*/gi, '\n\n#### $1\n\n')
    .replace(/\n*<h4[^<]*>(.*?)<\/h4>\n*/gi, '\n\n##### $1\n\n')
    .replace(/\n*<h5[^<]*>(.*?)<\/h5>\n*/gi, '\n\n###### $1\n\n')
    .replace(/\n\n\n+/gi, '\n\n')
    .replace(/<span class="chapter">(\d+)<\/span>/gi, '__$1__\n')
    .replace(/<span class="verse"[^>]*>(\d+)<\/span> ?/gi, '<sup>$1</sup>')
    .replace(/\n<span class="auslegung">(.*?)<\/span>\n/gi, '\n_$1_\n')
    .replace(/( ?)<span class="auslegung">( ?)\(?(.*?)\)?( ?)<\/span>/gi, '<sup title="$3">&#x2732;</sup>')
    .trim();
  return result;
}