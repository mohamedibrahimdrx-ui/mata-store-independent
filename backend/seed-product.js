
const { db } = require("./src/database/firestore");
const { productSchema } = require("./src/validators/product");

async function main() {
  const product = {
    name: "شنطة MATA التجريبية",
    description: "منتج تجريبي لاختبار اختيار الألوان.",
    price: 499,
    category: "bags",
    image: "https://placehold.co/600x600/png",
    active: true,
    colors: [
      {
        id: "black",
        name: "أسود",
        hex: "#222222",
        stock: 10,
        active: true,
      },
      {
        id: "brown",
        name: "بني",
        hex: "#805333",
        stock: 8,
        active: true,
      },
      {
        id: "beige",
        name: "بيج",
        hex: "#D8C4A4",
        stock: 5,
        active: true,
      },
    ],
  };

  const validation = productSchema.safeParse(product);

  if (!validation.success) {
    console.error("Product validation failed.");
    console.error(validation.error.flatten());
    process.exitCode = 1;
    return;
  }

  try {
    const ref = await db.collection("products").add(validation.data);

    console.log("Test product created successfully.");
    console.log("Product ID:", ref.id);
    console.log("Colors: black, brown, beige");
  } catch (error) {
    console.error("Could not create test product.");
    console.error("Error code:", error.code || "UNKNOWN");
    process.exitCode = 1;
  }
}

main();
