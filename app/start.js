const app = require('./app.js');

const port = parseInt(process.env.PORT || 5000);
console.log("Start listening on port " + port);
app.listen(port, (err) => {
    if (err) {
        return console.log("something bad happened", err)
    }
});