const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const { log } = require('console');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'mypassword'; 

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '@jith07',
  database: 'taskdb'
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to MySQL database');
});

// setups
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public', 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Auth setupts
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect('/login');
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.redirect('/login');
    }
    req.user = user;
    next();
  });
};

// Login page
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Register page(sign in)
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// Register 
app.post('/register', async (req, res) => {
  const { userName, password } = req.body;

  if (!userName || !password) {
    return res.render('register', { error: 'Username and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query('INSERT INTO users (userName, password) VALUES (?, ?)',
      [userName, hashedPassword],
      (err, result) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            return res.render('register', { error: 'Username already exists' });
          }
          console.error(err);
          return res.render('register', { error: 'Registration failed' });
        }
        res.redirect('/login');
      }
    );
  } catch (error) {
    console.error(error);
    res.render('register', { error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  const { userName, password } = req.body;

  if (!userName || !password) {
    return res.render('login', { error: 'Username and password are required' });
  }

  db.query(
    'SELECT * FROM users WHERE userName = ?',
    [userName],
    async (err, results) => {
      if (err) {
        console.error(err);
        return res.render('login', { error: 'Login failed' });
      }

      if (results.length === 0) {
        return res.render('login', { error: 'Invalid username or password' });
      }

      const user = results[0];
      // const hashedPassword = await bcrypt.hash(user.password, 10);

      // console.log(hashedPassword , password , user.password);
      
      const passwordMatch = bcrypt.compareSync(password,user.password);

      console.log(bcrypt.hashSync("Ajith@123" , 10));
      
      console.log("Test: "+bcrypt.compareSync("Ajith@123","$2b$10$l2XTQYer7gtbNNmpSzFvDOse2q3JdyrhF3RcMwu7kb5SIZZFLiYOG"));
      
      console.log(passwordMatch + "   ps,dmvfhg,adsfjhasdfkjasdfjasfdjasgjfgaskjfgaksjvfkjafk");

      if (!passwordMatch) {
        return res.render('login', { error: 'Invalid username or password' });
      }

      const token = jwt.sign(
        { userId: user.userId, userName: user.userName },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.cookie('token', token, { httpOnly: true });
      res.redirect('/');
    }
  );
});


// Logout
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

// Home page (protected)
app.get('/', authenticateToken, (req, res) => {
  const query = `
    SELECT t.* FROM tasks t
    INNER JOIN relations r ON t.id = r.id
    WHERE r.userId = ?
    ORDER BY t.created_at DESC
  `;

  db.query(query, [req.user.userId], (err, tasks) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Error fetching tasks');
    }
    res.render('home', { tasks, userName: req.user.userName });
  });
});

app.get('/about', authenticateToken, (req, res) => {
  res.render('about', { userName: req.user.userName });
});

app.get('/contact', authenticateToken, (req, res) => {
  res.render('contact', { userName: req.user.userName });
});

// Add task (protected)
app.post('/tasks', authenticateToken, (req, res) => {
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const insertTask = 'INSERT INTO tasks (title, description) VALUES (?, ?)';

  db.query(insertTask, [title, description], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error adding task' });
    }

    const taskId = result.insertId;
    const insertRelation = 'INSERT INTO relations (userId, id) VALUES (?, ?)';

    db.query(insertRelation, [req.user.userId, taskId], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error linking task to user' });
      }
      res.redirect('/');
    });
  });
});

// Update task status (protected)
app.post('/tasks/:id/toggle', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Verify task belongs to user
  db.query('SELECT * FROM relations WHERE userId = ? AND id = ?',
    [req.user.userId, id],
    (err, results) => {
      if (err || results.length === 0) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const query = `
        UPDATE tasks 
        SET status = IF(status = 'pending', 'completed', 'pending') 
        WHERE id = ?
      `;

      db.query(query, [id], (err) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error updating task' });
        }
        res.redirect('/');
      });
    }
  );
});

// Delete task (protected)
app.post('/tasks/:id/delete', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Verify task belongs to user
  db.query('SELECT * FROM relations WHERE userId = ? AND id = ?',
    [req.user.userId, id],
    (err, results) => {
      if (err || results.length === 0) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Relations will be deleted automatically due to CASCADE
      db.query('DELETE FROM tasks WHERE id = ?', [id], (err) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error deleting task' });
        }
        res.redirect('/');
      });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});




