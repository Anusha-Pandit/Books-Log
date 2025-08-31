import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import dotenv from "dotenv";
import multer from "multer";
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const port = 3000;
dotenv.config();

const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

db.connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch(err => console.error("Database Connection Error:", err));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// Function to get book cover URL using Open Library API
async function getBookCoverUrl(title) {
  try {
    const response = await axios.get(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}`
    );
    if (response.data.numFound === 0) return null;

    const bookData = response.data.docs[0];
    if (bookData.isbn && bookData.isbn.length > 0) {
      return `https://covers.openlibrary.org/b/isbn/${bookData.isbn[0]}-L.jpg`;
    }
    return null;
  } catch (error) {
    console.error("Error fetching book cover:", error);
    return null;
  }
}

// Home route
app.get("/", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM books ORDER BY id ASC");
    const listBook = result.rows;

    const booksWithCovers = await Promise.all(
      listBook.map(async (book) => {
        const coverUrl = await getBookCoverUrl(book.title);
        return { ...book, coverUrl };
      })
    );

    res.render("index.ejs", {
      listTitle: "My Book Collection",
      listBook: booksWithCovers,
    });
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Add book form
app.get("/new", (req, res) => {
  res.render("new.ejs", { book: null, isEdit: false });
});

// Add book submission
app.post("/new", upload.single("cover"), async (req, res) => {
  const { title, author, description } = req.body;
  const coverBuffer = req.file ? req.file.buffer : null; // get file as buffer
  try {
    await db.query(
      "INSERT INTO books (title, author, description, cover) VALUES ($1, $2, $3, $4)",
      [title, author, description, coverBuffer]
    );
    res.redirect("/");
  } catch (error) {
    console.error("Error adding new book:", error);
    res.status(500).send("Error saving book to database");
  }
});


// Edit book form
app.get("/edit/:id", async (req, res) => {
  const bookId = req.params.id;
  try {
    const result = await db.query("SELECT * FROM books WHERE id=$1", [bookId]);
    const book = result.rows[0];
    if (!book) return res.status(404).send("Book not found");
    res.render("new.ejs", { book, isEdit: true });
  } catch (error) {
    console.error("Error fetching book:", error);
    res.status(500).send("Error fetching book from database");
  }
});

// Edit book submission
app.post("/edit/:id", upload.single("cover"), async (req, res) => {
  const bookId = req.params.id;
  const { title, author, description } = req.body;
  const coverBuffer = req.file ? req.file.buffer : null; // Only if a new file is uploaded

  try {
    if (coverBuffer) {
      // Update all fields including cover
      await db.query(
        "UPDATE books SET title = $1, author = $2, description = $3, cover = $4 WHERE id = $5",
        [title, author, description, coverBuffer, bookId]
      );
    } else {
      // Update fields without changing cover
      await db.query(
        "UPDATE books SET title = $1, author = $2, description = $3 WHERE id = $4",
        [title, author, description, bookId]
      );
    }
    res.redirect("/");
  } catch (error) {
    console.error("Error updating book:", error);
    res.status(500).send("Error updating book in database");
  }
});

// Delete book
app.post("/delete/:id", async (req, res) => {
  const bookId = req.params.id;
  try {
    await db.query("DELETE FROM books WHERE id=$1", [bookId]);
    res.redirect("/");
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).send("Error deleting book from database");
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
