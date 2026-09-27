const numberFormatter = new Intl.NumberFormat("en-US");

function formatNumber(value) {
    return numberFormatter.format(value);
}

module.exports = { formatNumber };