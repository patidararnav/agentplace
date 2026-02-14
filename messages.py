from uagents import Model


class ServiceRequest(Model):
    service_type: str
    max_price: int


class ServiceQuote(Model):
    price: int
    vendor_name: str


class QuoteAcceptance(Model):
    text: str
