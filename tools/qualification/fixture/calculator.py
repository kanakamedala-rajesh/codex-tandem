def summarize(values):
    return {'count': len(values), 'sum': sum(values), 'sumSquares': sum(value * value for value in values)}
