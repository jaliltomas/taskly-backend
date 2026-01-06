import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ParsedProduct {
  nombre: string;
  precio: number;
}

interface ProductParseResult {
  esLista: boolean;
  productos: ParsedProduct[];
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    if (!apiKey) {
      this.logger.warn('GOOGLE_API_KEY not configured');
    }
    this.genAI = new GoogleGenerativeAI(apiKey || '');
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  private cleanJsonResponse(text: string): string {
    return text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
  }

  private parseJsonSafely(text: string): any {
    const cleaned = this.cleanJsonResponse(text);
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error(`Could not parse JSON from: ${text}`);
    }
  }

  /**
   * Detect if message contains a price list
   */
  async detectPriceList(message: string): Promise<{ esLista: boolean }> {
    const prompt = `Sos un analizador experto en listas de precios enviadas por WhatsApp.

Tu tarea es detectar si el texto contiene al menos UN producto con su precio.

Si el texto **NO** contiene ningún producto con precio (por ejemplo, si es un saludo, una pregunta, una conversación general, o no menciona precios de productos),
devolvé exactamente:
{ "esLista": false }

Si el texto **SÍ** contiene al menos UN producto con su precio (pueden ser uno o muchos productos),
devolvé exactamente:
{ "esLista": true }

Ejemplos de esLista: true:
- "iphone 16 pro max 1500usd" → { "esLista": true }
- "Samsung S24 $800" → { "esLista": true }
- "iPhone 13 128gb 450\niPhone 14 256gb 650" → { "esLista": true }

Ejemplos de esLista: false:
- "Hola, buenos días!" → { "esLista": false }
- "¿Tenés iPhone?" → { "esLista": false }
- "Gracias por la info" → { "esLista": false }

No devuelvas ningún otro texto ni explicación.

---
Texto a analizar:
${message}`;

    const result = await this.model.generateContent(prompt);
    const response = result.response.text();
    return this.parseJsonSafely(response);
  }

  /**
   * Parse products from message
   */
  async parseProducts(message: string): Promise<ProductParseResult> {
    const prompt = `Sos un analizador experto en listas de precios enviadas por WhatsApp.

Tu tarea es leer el texto recibido, identificar productos con precios y devolverlos ya normalizados, listos para embeddings.

Instrucciones de parsing:

Eliminar emojis, símbolos decorativos y separadores.

Identificar cada línea que contenga un producto + precio.

Si un producto incluye múltiples colores o variantes en la misma línea (ej: "azul/negro"):
➝ Crear un producto separado por cada variante, manteniendo el mismo precio.

Normalizar marca y modelo, por ejemplo:

"IP", "IPH", "iphn" → iPhone

"SAM", "s23fe", "S22FE" → Samsung S23 FE, Samsung S22 FE

"MOT", "moto" → Motorola

Estandarizar estructura del nombre:
→ Marca Modelo Variante Capacidad Color Otros

Mantener variantes importantes:

Colores (blue, silver, green, red, black, purple, etc.)

Capacidades (128GB, 256GB, 512GB, etc.)

Tamaños (44mm, 46mm, etc.)

Ediciones (Pro, Max, Ultra, FE, SE)

Normalizar porcentajes de batería:

"85%🔋", "86/84", "85 % batería" → Convertir a formato estándar:
→ "85% batería"
→ "84–86% batería"

Convertir cualquier símbolo de moneda a número limpio:
Ejemplos aceptados: $250, us$300, U$S 320, USD 270, 200 usd
→ devolver: "precio": 250

Reglas estrictas:

No agrupar productos que parezcan iguales.

No deduplicar. Cada línea con precio = un producto distinto.

No agregar texto adicional fuera del JSON.

Si no es una lista, devolvé { "esLista": false }.

Estructura EXACTA del JSON a devolver:
{
  "esLista": true,
  "productos": [
    {
      "nombre": "iPhone 13 128GB Blue 85% batería",
      "precio": 325
    }
  ]
}

Texto a analizar:

${message}`;

    const result = await this.model.generateContent(prompt);
    const response = result.response.text();
    const parsed = this.parseJsonSafely(response);

    if (!parsed.esLista) {
      return { esLista: false, productos: [] };
    }

    return {
      esLista: true,
      productos: parsed.productos || [],
    };
  }

  /**
   * Normalize product name to standard commercial format
   */
  async normalizeProductName(rawName: string): Promise<string> {
    const prompt = `Sos un experto en catalogación de productos de tecnología.
Tu única tarea es recibir un texto sucio de un producto y devolver su "Nombre Comercial Estándar" (Common Name).

REGLAS DE NORMALIZACIÓN:
1. Estructura: [Marca] [Modelo] [Variante] [Capacidad] [Color (si existe)] [Estado/Batería (si aplica)]
2. Marca: Normaliza mayúsculas (ej: "iphone" -> "iPhone", "samsung" -> "Samsung").
3. Limpieza:
   - Elimina estados irrelevantes como: "nuevo", "sellado", "impecable".
   - EXCEPCIÓN: Si indica "usado" o porcentaje de batería (ej: "88%", "batería 90%"), DEBES incluirlo al final.
   - Elimina precios y monedas.
   - Elimina emojis (pero conserva el texto del % de batería si está junto a uno).
   - Elimina palabras de venta: "oferta", "promo", "disponible", "entrando".
4. Capacidad: Estandariza a mayúsculas (128gb -> 128GB, 1tb -> 1TB).

EJEMPLOS:
Input: "Celular Samsung s23 fe de 128 gigas color crema - nuevo caja sellada"
Output: Samsung S23 FE 128GB Cream

Input: "🔥 OFERTA IPHONE 13 NORMAL 128 BLUE 🔋88%"
Output: iPhone 13 128GB Blue Usado 88%

Input: "MOTO G54 5G 256/8 VEGAN LEATHER USADO"
Output: Motorola Moto G54 5G 256GB Vegan Leather Usado

Input del usuario: ${rawName}
Responde SOLAMENTE con el nombre normalizado final. Sin comillas ni texto extra.
IMPORTANTE:
- NO repitas el input.
- NO expliques tus cambios.
- Devuelve SOLAMENTE el string limpio final.`;

    const result = await this.model.generateContent(prompt);
    const response = result.response.text();
    return response.trim().replace(/^["']|["']$/g, '');
  }

  /**
   * Validate if two products are the same
   */
  async validateProductIdentity(
    userInput: string,
    dbCandidate: string,
  ): Promise<{ esMismo: boolean }> {
    const prompt = `Actúa como un validador estricto de identidad de productos.
Tu trabajo es comparar el "Input del Usuario" con el "Candidato Encontrado" en la base de datos y decidir si son EXACTAMENTE el mismo producto comercial.

INPUT USUARIO: ${userInput}
CANDIDATO DB: ${dbCandidate}

REGLAS DE DECISIÓN ESTRICTAS:
1. Modelos Diferentes = FALSE (Ej: "iPhone 13" vs "iPhone 14" es FALSE).
2. Variantes Diferentes = FALSE (Ej: "Pro" vs "Pro Max" es FALSE).
3. Capacidades Diferentes = FALSE (Ej: "128GB" vs "256GB" es FALSE).
4. Colores: Si el usuario NO especifica color, ignora el color del candidato (TRUE). Si el usuario SÍ especifica color y es distinto al candidato, es FALSE.

Ejemplos:
- User: "iPhone 13 128" | DB: "iPhone 13 128GB Blue" -> TRUE (Es el mismo modelo y capacidad).
- User: "S23 Ultra" | DB: "S23 Plus" -> FALSE.
- User: "iPhone 15" | DB: "iPhone 15 Pro" -> FALSE.

Responde EXCLUSIVAMENTE con un JSON:
{ "esMismo": true }
o
{ "esMismo": false }`;

    const result = await this.model.generateContent(prompt);
    const response = result.response.text();
    return this.parseJsonSafely(response);
  }

  /**
   * Classify product into category
   */
  async classifyCategory(
    productName: string,
    price: number,
    categories: Array<{ name: string; description?: string | null }>,
  ): Promise<{ categoria: string }> {
    // Build category list with descriptions
    const categoriesStr = categories
      .map((c) => c.description ? `- ${c.name}: ${c.description}` : `- ${c.name}`)
      .join('\n');

    const categoryNames = categories.map(c => c.name);

    const prompt = `Sos un experto en hardware. Tu única tarea es clasificar el producto en una de las siguientes categorías exactas:

${categoriesStr}

REGLAS CRÍTICAS:
1. Si el producto es un iPhone y su nombre menciona un porcentaje de batería (ej: "85%", "100%", "90% bat"), clasifícalo OBLIGATORIAMENTE como "iPhone Usado".
2. Si es un iPhone nuevo/sellado sin mención de porcentaje, usa la categoría "iPhone".
3. Lo mismo aplica para Samsung usado/nuevo.
4. Si el producto no encaja claramente en ninguna categoría, usa "Otros".

Producto: ${productName}
Precio: ${price}

Responde SOLAMENTE un JSON:
{ "categoria": "NombreCategoria" }`;

    const result = await this.model.generateContent(prompt);
    const response = result.response.text();
    const parsed = this.parseJsonSafely(response);

    // Validate category exists
    const categoria = parsed.categoria || 'Otros';
    if (!categoryNames.includes(categoria)) {
      return { categoria: 'Otros' };
    }

    return { categoria };
  }
}
